
const CAN_CRC_POLY = 0xC599; // or 0x4599
const CAN_CRC_MASK = 0x7FFF;

const CAN_START_OFFSET = 0;
const CAN_ID_OFFSET = 1;
const CAN_RTR_OFFSET = 12;
const CAN_IDE_OFFSET = 13;
const CAN_r0_OFFSET = 14; // CAN 2.0A
const CAN_DLC_OFFSET = 15;
const CAN_DATA_OFFSET = 19;

function parseCANFrame(bitString, with_stuff_bits = true) {
    bitString = bitString.trim().replace(/\s+/g, '');

    const frame = {
        raw_string: bitString,
        with_stuff_bits: with_stuff_bits,
        stuff_bits: [],
        crc_calculated: null,
        missing_bits: null,
        errors: [],

        SOF: null,
        ID: null,
        RTR: null,
        IDE: null,
        r0: null,
        DLC: null,
        DATA: null,
        CRC: null,
        CRC_DELIMITER: null,
        ACK: null,
        ACK_DELIMITER: null,
        EOF: null,
        IFS: null,
    };

    if (!/^[01]+$/.test(bitString)) {
        frame.missing_bits = 47; // 1 + 11 + 1 + 6 + 16 + 2 + 7 + 3; 
        frame.errors.push({text: "Input bit string should contain only 1s and 0s!", type: "invalid_input"});
        return frame;
    }

    let same_bit_counter = 0;
    let last_bit = null;

    let id = 0, dlc = 0, data_byte = 0, crc = 0, crc_rg = 0;

    let frame_i = 0;
    for (let i = 0; i < bitString.length; i++) {
        const bit = bitString[i] === "0" ? 0 : 1;

        let is_staff_bit = false;
        if (with_stuff_bits) { // stuff bits checking
            if (frame.DLC == null || frame_i <= CAN_DATA_OFFSET + frame.DLC * 8 + 14) // only upto end of CRC
            {
                if (last_bit == bit) {
                    same_bit_counter++;
                    if (same_bit_counter > 5) { frame.errors.push({text: `Stuff bit error at position ${i}!`, type:'stuff', bit: bit, index: i}); }
                } else {
                    if (same_bit_counter == 5) { 
                        is_staff_bit = true;
                    }
                    same_bit_counter = 1;
                    last_bit = bit;
                }

                if (is_staff_bit) {
                    frame.stuff_bits.push(i);
                    continue; // skip staff bit
                }
            }
        }

        if (frame_i == CAN_START_OFFSET) {
            frame.SOF = bit;
            if (frame.SOF !== 0) { frame.errors.push({text: "SOF error - should be 0!", type: "SOF", bit: bit, index: i}); }
        } else if (frame_i >= CAN_ID_OFFSET && frame_i < CAN_RTR_OFFSET) {
            id = (id << 1) | bit;
            if (frame_i == CAN_RTR_OFFSET - 1) frame.ID = id;
        } else if (frame_i == CAN_RTR_OFFSET) {
            frame.RTR = bit;
        } else if (frame_i == CAN_IDE_OFFSET) {
            frame.IDE = bit;
        } else {
            if (frame.IDE === 0) { // CAN 2.0A
                if (frame_i == CAN_r0_OFFSET) {
                    frame.r0 = bit;
                    if (frame.r0 !== 0) { frame.errors.push({text: "r0 error - should be 0!", type: "r0", bit: bit, index: i}); }
                } else if (frame_i >= CAN_DLC_OFFSET && frame_i <= 18) {
                    dlc = (dlc << 1) | bit;
                    if (frame_i == 18) { 
                        frame.DLC = Math.min(8, dlc);
                        if (dlc > 8) { frame.errors.push({text: "DLC must be from range [0-8]!", type: "dlc"}) }
                    }
                } else { // known Data length
                    if (frame_i >= CAN_DATA_OFFSET && frame_i < CAN_DATA_OFFSET + frame.DLC * 8) {
                        data_byte = (data_byte << 1) | bit;
                        if ((frame_i - CAN_DATA_OFFSET) % 8 == 7) {
                            if (frame.DATA == null) { frame.DATA = []; }
                            frame.DATA.push(data_byte);
                            data_byte = 0;
                        }
                    } else if (frame_i >= CAN_DATA_OFFSET + frame.DLC * 8 && frame_i <= CAN_DATA_OFFSET + frame.DLC * 8 + 14) {
                        crc = crc << 1 | bit;
                        if (frame_i == CAN_DATA_OFFSET + frame.DLC * 8 + 14) { frame.CRC = crc; }
                    } else if (frame_i == CAN_DATA_OFFSET + frame.DLC * 8 + 15) {
                        frame.CRC_DELIMITER = bit;
                    } else if (frame_i == CAN_DATA_OFFSET + frame.DLC * 8 + 16) {
                        frame.ACK = bit;
                    } else if (frame_i == CAN_DATA_OFFSET + frame.DLC * 8 + 17) {
                        frame.ACK_DELIMITER = bit;
                    } else if (frame_i >= CAN_DATA_OFFSET + frame.DLC * 8 + 18 && frame_i <= 19 + frame.DLC * 8 + 18 + 6) {
                        if (frame.EOF == null) { frame.EOF = ""; }
                        frame.EOF += bit.toString();
                    } else if (frame_i >= CAN_DATA_OFFSET + frame.DLC * 8 + 18 + 6 && frame_i <= 19 + frame.DLC * 8 + 18 + 6 + 3) {
                        if (frame.IFS == null) { frame.IFS = ""; }
                        frame.IFS += bit;
                    }
                }
            } else { // CAN 2.0B
                frame.errors.push({text: "IDE has value 1 - CAN 2.0B frames are not supported yet!", type: "IDE", bit: bit, index: i}); 
                    // TODO: add support for CAN 2.0B
            }
        }

        // CRC calculation
        if (frame_i >= 1 && frame_i <= 18 + frame.DLC * 8) {
            const crc_nxt = bit ^ ((crc_rg >> 14) & 1);
            crc_rg = crc_rg << 1;
            if (crc_nxt) {
                crc_rg ^= CAN_CRC_POLY;
            }
            crc_rg = crc_rg & CAN_CRC_MASK;
        }

        frame_i++;
    }

    if (frame.IDE == 0 || frame.IDE == null) {
        let dlc = frame.DLC != null ? frame.DLC : 0;
        frame.missing_bits = Math.max(0, 19 + dlc * 8 + 24 + 4 - frame_i);
    } // TODO: else CAN 2.0B
    

    frame.crc_calculated = crc_rg;
    if (frame.CRC != null && frame.CRC !== frame.crc_calculated) {
        frame.errors.push({text: `CRC error - calculated: 0x${crc_rg.toString(16).toUpperCase()}, received: 0x${frame.CRC.toString(16).toUpperCase()}`, 
            type: "CRC"});
    }

    return frame;
}