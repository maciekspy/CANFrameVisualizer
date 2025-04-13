
const fieldType = (name, length) => Object.freeze({ name: name, length: length, toString: () => name });

const FieldTypes = {
  START: fieldType("Start of Frame", 1),
  ID: fieldType("Identifier", 11),
  RTR: fieldType("Remote Transmission Request", 1),
  IDE: fieldType("Identifier Extension", 1),
  r0: fieldType("Reserved Bit", 1),
  DLC: fieldType("Data Length Code", 4),
  DATA: fieldType("Data", 64),
  CRC: fieldType("Cyclic Redundancy Check", 15),
  CRC_DELIMITER: fieldType("CRC Delimiter", 1),
  ACK: fieldType("Acknowledge", 1),
  ACK_DELIMITER: fieldType("Acknowledge Delimiter", 1),
  EOF: fieldType("End of Frame", 7),
  INTERMISSION: fieldType("Intermission", 3),
}

function toHexStr(int) { return "0x" + int.toString(16).toUpperCase(); }

function onBitInput() {
  const bitString = document.getElementById("bitInput").value.trim().replaceAll(/\s+/g, "");
  const frame = parseCANFrame(bitString);
  showErrors(frame);
  drawCANFrame(frame, document.getElementById("hideStuffBits").checked);
  updateDetailsTable(frame);
  const raw_frame_str = JSON.stringify(frame, null, 2);
  document.getElementById("rawFrame").value = raw_frame_str;
}

document.addEventListener("DOMContentLoaded", function () {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('value');
  if (value) document.getElementById("bitInput").value = value.trim().replaceAll(/\s+/g, "");

  //document.getElementById("visualizeBtn").addEventListener("click", drawCANFrame);

  document.getElementById("hideStuffBits").addEventListener("change", onBitInput);
  document.getElementById("bitInput").addEventListener("input", onBitInput);
  onBitInput();
});


function drawCANFrame(frame, hide_stuff_bits = true, show_signals = true) {
  let bitString = frame.raw_string;

  const canvasContainer = document.getElementById("frameImg");
  canvasContainer.innerHTML = "";

  if (bitString === undefined) {
    let s = Snap(canvasContainer.clientWidth, canvasContainer.clientHeight);
    canvasContainer.appendChild(s.node);
    const textElement = s.text(canvasContainer.clientWidth / 2, canvasContainer.clientHeight / 2, "Invalid Frame data!");
    textElement.attr({
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "font-size": "48px",
      fill: "red"
    });
    return;
  };

  bitString = bitString + '?'.repeat(frame.missing_bits)

  const rectWidth = 25;
  const rectHeight = 40;
  const offsetX = 10;
  const offsetY = 180;

  const canvasWidth = offsetX + bitString.length * (rectWidth);
  const canvasHeight = offsetY + rectHeight + 10 + 150;

  let s = Snap(canvasWidth, canvasHeight);
  canvasContainer.appendChild(s.node);

  s.select("defs").append(Snap.parse(
    '<marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" ' +
    'orient="auto-start-reverse"> <path d="M 0 0 L 10 5 L 0 10 z" />' +
    '</marker>'
  ));

  const drawHLine = (x, y, height, color = "#000") => {
    const line = s.line(x, y, x, y - height);
    line.attr({ stroke: color, strokeWidth: 1 });
  }
  const drawFieldRange = (x1, x2, height, text, color = "#000") => {
    // const x1 = offsetX + s_i * (rectWidth);
    // const x2 = offsetX + (e_i + 1) * (rectWidth);
    const textElement = s.text((x1 + x2) / 2, offsetY - height + 1, text);
    textElement.attr({
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "font-size": "18px",
      fill: color
    });
    const textBBox = textElement.getBBox();
    const line1 = s.line(x1, offsetY - height, textBBox.x, offsetY - height);
    line1.attr({ stroke: color, strokeWidth: 1 });
    line1.node.setAttribute("marker-start", "url(#arrow)");
    const line2 = s.line(textBBox.x + textBBox.width, offsetY - height, x2, offsetY - height);
    line2.attr({ stroke: color, strokeWidth: 1 });
    line2.node.setAttribute("marker-end", "url(#arrow)");
  }


  const frame_offsets = {};
  let frame_i = 0;

  const bitRectClick = (event) => {
    const i = parseInt(event.target.getAttribute("char_i"));
    const bitInput = document.getElementById("bitInput");
    if (i <= bitInput.value.length) {
      const newBitString = bitInput.value.substr(0, i) + (bitInput.value.substr(i, 1) == '0' ? '1' : '0') + bitInput.value.substr(i + 1);
      bitInput.value = newBitString;
    }
    onBitInput();
  };

  for (let i = 0; i < bitString.length; i++) {
    const x = offsetX + (hide_stuff_bits ? frame_i : i) * (rectWidth);
    const y = offsetY;
    const bitChar = bitString[i];

    const is_staff_bit = frame.stuff_bits.includes(i);
    if (hide_stuff_bits && is_staff_bit) continue;

    frame_offsets[frame_i] = x;

    const fillColor = (() => {
      if (is_staff_bit) return "#F0F";
      if (frame_i >= 1 && frame_i <= 11) return "lime";
      if (frame_i == 12) return "cyan";
      if (frame_i == 13) return "#FEB";
      if (frame_i >= 15 && frame_i <= 18) return "yellow";
      if (frame_i >= CAN_DATA_OFFSET && frame_i < CAN_DATA_OFFSET + frame.DLC * 8) {
        return Math.floor((frame_i - CAN_DATA_OFFSET) / 8) % 2 == 0 ? "#F00" : "#F55";
      }
      if (frame_i >= CAN_DATA_OFFSET + frame.DLC * 8 && frame_i <= CAN_DATA_OFFSET + frame.DLC * 8 + 14)
        return "orange";
      if (frame_i == CAN_DATA_OFFSET + frame.DLC * 8 + 16) return "#a1e336";
      if (frame_i >= CAN_DATA_OFFSET + frame.DLC * 8 + 18 && frame_i <= 19 + frame.DLC * 8 + 18 + 6)
        return "#AAA";
      return "#FFF";
    })();

    let rect = s.rect(x, y, rectWidth, rectHeight);
    rect.attr({
      fill: fillColor,
      stroke: "#000",
      strokeWidth: 2,
      cursor: "pointer",
      "char_i": i,
      "frame_id": frame_i,
    });
    rect.click(bitRectClick);

    let bitCharText = s.text(x + rectWidth / 2, y + rectHeight / 2 * 1.15, bitChar);
    bitCharText.attr({
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "font-size": "32px",
      fill: "#000",
      "pointer-events": "none",
    });

    const bitName = (() => {
      if (is_staff_bit) return "Stuff Bit";
      if (frame_i == 0) return "Start";
      if (frame_i >= 1 && frame_i <= 11) return "ID" + (11 - frame_i);
      if (frame_i == 12) return "RTR";
      if (frame_i == 13) return "IDE";
      if (frame_i == 14) return "r0";
      if (frame_i >= 15 && frame_i <= 18) return "DLC" + (18 - frame_i);
      if (frame_i >= CAN_DATA_OFFSET && frame_i < CAN_DATA_OFFSET + frame.DLC * 8) {
        const bit = 7 - Math.floor((frame_i - CAN_DATA_OFFSET) % 8);
        const byte = Math.floor((frame_i - CAN_DATA_OFFSET) / 8);
        return "DB" + byte + "_" + bit;
      }
      if (frame_i >= CAN_DATA_OFFSET + frame.DLC * 8 && frame_i <= CAN_DATA_OFFSET + frame.DLC * 8 + 14)
        return "CRC" + (14 - (frame_i - CAN_DATA_OFFSET - frame.DLC * 8));
      if (frame_i == CAN_DATA_OFFSET + frame.DLC * 8 + 15)
        return "CRC Delimiter";
      if (frame_i == CAN_DATA_OFFSET + frame.DLC * 8 + 16) return "ACK";
      if (frame_i == CAN_DATA_OFFSET + frame.DLC * 8 + 17) return "ACK Delimiter";
      if (frame_i >= CAN_DATA_OFFSET + frame.DLC * 8 + 18 && frame_i <= 19 + frame.DLC * 8 + 18 + 6)
        return "EOF" + (19 + frame.DLC * 8 + 18 + 6 - frame_i);
      if (frame_i >= CAN_DATA_OFFSET + frame.DLC * 8 + 24 && frame_i <= 19 + frame.DLC * 8 + 24 + 3)
        return "IFS" + (19 + frame.DLC * 8 + 24 + 3 - frame_i);
    })();

    // Field name
    let bitNameText = s.text(0, 0, bitName);
    bitNameText.transform(`translate(${x},${y}) rotate(270) translate(5, 18)`);
    bitNameText.attr({
      "text-anchor": "start",
      "font-size": "18px",
      fill: "#000",
    });

    const dlc = frame.DLC != null ? frame.DLC : 0;

    const lineHeight = 145;
    if (frame_i == 0) { drawHLine(x, y, offsetY - 5); drawHLine(x + rectWidth, y, lineHeight); }
    if (frame_i == CAN_RTR_OFFSET - 1) {
      drawHLine(x + rectWidth, y, lineHeight - 20);
      drawFieldRange(frame_offsets[CAN_ID_OFFSET], frame_offsets[CAN_RTR_OFFSET - 1] + rectWidth, lineHeight - 10 - 20, "11");
    }
    if (frame_i == CAN_IDE_OFFSET - 1) {
      drawHLine(x + rectWidth, y, lineHeight);
      drawFieldRange(frame_offsets[CAN_ID_OFFSET], frame_offsets[CAN_IDE_OFFSET - 1] + rectWidth, lineHeight - 10, "Arbitration");
    }
    if (frame_i == CAN_DATA_OFFSET - 1) {
      drawHLine(x + rectWidth, y, lineHeight);
      drawFieldRange(frame_offsets[CAN_IDE_OFFSET], frame_offsets[CAN_DATA_OFFSET - 1] + rectWidth, lineHeight - 10, "Control");
      drawHLine(frame_offsets[CAN_IDE_OFFSET + 2], y, lineHeight - 20);
      drawFieldRange(frame_offsets[CAN_IDE_OFFSET + 2], frame_offsets[CAN_DATA_OFFSET - 1] + rectWidth, lineHeight - 10 - 20, "4");
    }
    if (dlc > 0 && frame_i == CAN_DATA_OFFSET + dlc * 8 - 1) {
      drawHLine(x + rectWidth, y, lineHeight);
      drawFieldRange(frame_offsets[CAN_DATA_OFFSET], frame_offsets[CAN_DATA_OFFSET + dlc * 8 - 1] + rectWidth, lineHeight - 10, "Data");
      drawFieldRange(frame_offsets[CAN_DATA_OFFSET], frame_offsets[CAN_DATA_OFFSET + dlc * 8 - 1] + rectWidth, lineHeight - 10 - 20,
        frame.DATA.length == 1 ? "8" : (frame.DATA.length + "*8=" + (frame.DATA.length * 8)));
    }
    if (frame_i == CAN_DATA_OFFSET + dlc * 8 + 15) {
      drawHLine(x + rectWidth, y, lineHeight);
      drawFieldRange(frame_offsets[CAN_DATA_OFFSET + dlc * 8], frame_offsets[CAN_DATA_OFFSET + dlc * 8 + 15] + rectWidth, lineHeight - 10, "CRC");
      drawHLine(x, y, lineHeight - 20);
      drawFieldRange(frame_offsets[CAN_DATA_OFFSET + dlc * 8], frame_offsets[CAN_DATA_OFFSET + dlc * 8 + 15], lineHeight - 10 - 20, "15");
    }
    if (frame_i == CAN_DATA_OFFSET + dlc * 8 + 17) {
      drawHLine(x + rectWidth, y, lineHeight);
      drawFieldRange(frame_offsets[CAN_DATA_OFFSET + dlc * 8 + 16], frame_offsets[CAN_DATA_OFFSET + dlc * 8 + 17] + rectWidth, lineHeight - 10, "ACK");
    }
    if (frame_i == CAN_DATA_OFFSET + dlc * 8 + 24) {
      drawHLine(x + rectWidth, y, lineHeight);
      drawFieldRange(frame_offsets[CAN_DATA_OFFSET + dlc * 8 + 18], frame_offsets[CAN_DATA_OFFSET + dlc * 8 + 24] + rectWidth, lineHeight - 10, "End of Frame");
    }
    if (frame_i == CAN_DATA_OFFSET + dlc * 8 + 27) {
      drawHLine(x + rectWidth, y, offsetY - 5);
      drawFieldRange(frame_offsets[0], frame_offsets[CAN_DATA_OFFSET + dlc * 8 + 27] + rectWidth, offsetY - 15, "Complete CAN Frame");
    }

    if (!is_staff_bit) frame_i++;
  }

  if (show_signals) {
    const H0_level = 230;
    const H1_level = H0_level + 30;
    const L1_level = H1_level + 5;
    const L0_level = L1_level + 30;
    const noise = 5;
    let points_H = `${offsetX - 3},${H1_level} ${offsetX},${H1_level + Math.random() * noise}`; // start with "1"
    let points_L = `${offsetX - 3},${L1_level} ${offsetX},${L1_level + Math.random() * noise}`;
    let f_i = 0;
    for (let i = 0; i < bitString.length; i++) {
      if (hide_stuff_bits && frame.stuff_bits.includes(i)) continue;
      const bit = bitString[i] === "0" ? 0 : 1;
      const H_level = bit ? H1_level : H0_level;
      const L_level = bit ? L1_level : L0_level;
      for (let j = 0; j < rectWidth; j += 1) {
        points_H += ` ${offsetX + f_i * rectWidth + j},${H_level + Math.random() * noise}`;
        points_L += ` ${offsetX + f_i * rectWidth + j},${L_level + Math.random() * noise}`;
      }
      f_i++;
    }
    var polyline = s.el("polyline", { points: points_H });
    polyline.attr({
      fill: "none",
      stroke: "#00F",
      strokeWidth: 1
    });
    var polyline = s.el("polyline", { points: points_L });
    polyline.attr({
      fill: "none",
      stroke: "red",
      strokeWidth: 1
    });
  }
  if (0) {
    const L1_level = 230;
    const H0_level = 255;
    const L0_level = 270;
    const H1_level = 295;
    const noise = 5;
    let points_H = `${offsetX - 3},${H1_level} ${offsetX},${H1_level + Math.random() * noise}`; // start with "1"
    let points_L = `${offsetX - 3},${L1_level} ${offsetX},${L1_level + Math.random() * noise}`;
    let f_i = 0;
    for (let i = 0; i < bitString.length; i++) {
      if (hide_stuff_bits && frame.stuff_bits.includes(i)) continue;
      const bit = bitString[i] === "0" ? 0 : 1;
      const H_level = bit ? H1_level : H0_level;
      const L_level = bit ? L1_level : L0_level;
      for (let j = 0; j < rectWidth; j += 1) {
        points_H += ` ${offsetX + f_i * rectWidth + j},${H_level + Math.random() * noise}`;
        points_L += ` ${offsetX + f_i * rectWidth + j},${L_level + Math.random() * noise}`;
      }
      f_i++;
    }
    var polyline = s.el("polyline", { points: points_H });
    polyline.attr({
      fill: "none",
      stroke: "#00F",
      strokeWidth: 1
    });
    var polyline = s.el("polyline", { points: points_L });
    polyline.attr({
      fill: "none",
      stroke: "red",
      strokeWidth: 1
    });
  }

  return false;
}

function showErrors(frame) {
  const errorList = document.getElementById("error-list");
  if (frame.errors.length > 0) {
    errorList.classList.remove("d-none");
  } else {
    errorList.classList.add("d-none");
  }
  errorList.innerHTML = "";
  for (const error of frame.errors) {
    const li = document.createElement("li");
    li.textContent = error.text;
    errorList.appendChild(li);
  }
}

function updateDetailsTable(frame) {
  document.getElementById("sofValue").innerText = ("SOF" in frame && frame.SOF != null) ? frame.SOF : "-";
  document.getElementById("idLength").innerText = "11";
  document.getElementById("idValue").innerText = ("ID" in frame && frame.ID != null) ? frame.ID : "-";
  document.getElementById("rtrValue").innerText = ("RTR" in frame && frame.RTR != null) ? frame.RTR : "-";
  document.getElementById("ideValue").innerText = ("IDE" in frame && frame.IDE != null) ? frame.IDE : "-";
  document.getElementById("r0Value").innerText = ("r0" in frame && frame.r0 != null) ? frame.r0 : "-";
  document.getElementById("dlcValue").innerText = ("DLC" in frame && frame.DLC != null) ? frame.DLC : "-";
  document.getElementById("dataLength").innerText = ("DATA" in frame && frame.DATA != null) ? `${frame.DATA.length}*8=${frame.DATA.length * 8}` : "-";
  document.getElementById("dataValue").innerText = ("DATA" in frame && frame.DATA != null) ? frame.DATA.map(x => toHexStr(x)).join(" ") : "-";
  document.getElementById("crcValue").innerText = ("CRC" in frame && frame.CRC != null) ? toHexStr(frame.CRC) : "-";
  document.getElementById("crcDelimiterValue").innerText = ("CRC_DELIMITER" in frame && frame.CRC_DELIMITER != null) ? frame.CRC_DELIMITER : "-";
  document.getElementById("ackValue").innerText = ("ACK" in frame && frame.ACK != null) ? frame.ACK : "-";
  document.getElementById("ackDelimiterValue").innerText = ("ACK_DELIMITER" in frame && frame.ACK_DELIMITER != null) ? frame.ACK_DELIMITER : "-";
  document.getElementById("eofValue").innerText = ("EOF" in frame && frame.EOF != null) ? '"' + frame.EOF + '"' : "-";
  document.getElementById("ifsValue").innerText = ("IFS" in frame && frame.IFS != null) ? '"' + frame.IFS + '"' : "-";

  const stuff_bits_list = document.getElementById("stuff-bits-list");
  stuff_bits_list.innerHTML = "";
  if ("stuff_bits" in frame && frame.stuff_bits != null) {
    for (const bit of frame.stuff_bits) {
      const li = document.createElement("li");
      li.textContent = `Bit ${bit}`;
      stuff_bits_list.appendChild(li);
    }
  }

}

function downloadImage(e) {
  e.preventDefault();
  const format = document.getElementById("formatSelector").value;

  function downloadURI(uri, name) {
    var link = document.createElement("a");
    link.download = name;
    link.href = uri;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const svg = document.getElementById('frameImg').querySelector('svg');
  const bitString = document.getElementById('bitInput').value;
  var svgBlob = new Blob([svg.outerHTML], { type: "image/svg+xml;charset=utf-8" });
  var svgUrl = URL.createObjectURL(svgBlob);

  if (format === "svg") {
    downloadURI(svgUrl, `CAN_Frame_${bitString}.svg`);
  } else if (format === "png") {

    var img = new Image();
    img.onload = function () {
      const canvas = document.createElement("canvas");
      canvas.width = svg.getAttribute('width');
      canvas.height = svg.getAttribute('height');
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        downloadURI(URL.createObjectURL(blob), `CAN_Frame_${bitString}.png`);
      }, 'image/png');
    };
    img.src = svgUrl;
  }
  return false;
}