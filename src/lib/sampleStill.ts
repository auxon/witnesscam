export async function makeSampleStill(): Promise<{
  bytes: ArrayBuffer;
  mimeType: string;
  filename: string;
  previewUrl: string;
}> {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");

  ctx.fillStyle = "#120e0a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(212,160,23,0.18)";
  ctx.lineWidth = 1;
  for (let x = 40; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 40; y < canvas.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  const noise = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rand = crypto.getRandomValues(new Uint8Array(1800));
  for (let i = 0; i < rand.length; i++) {
    const px = (rand[i] * 19 + i * 97) % (canvas.width * canvas.height);
    const o = px * 4;
    noise.data[o] = Math.min(255, noise.data[o] + 40);
    noise.data[o + 1] = Math.min(255, noise.data[o + 1] + 18);
  }
  ctx.putImageData(noise, 0, 0);

  ctx.strokeStyle = "#d4a017";
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

  ctx.fillStyle = "#e7e1d4";
  ctx.font = "600 42px 'IBM Plex Mono', monospace";
  ctx.fillText("WITNESSCAM", 56, 90);
  ctx.fillStyle = "#d4a017";
  ctx.font = "500 18px 'IBM Plex Mono', monospace";
  ctx.fillText("SAMPLE STILL · NOT A CAMERA CAPTURE", 56, 124);

  const stamp = new Date().toISOString();
  ctx.fillStyle = "#8a8376";
  ctx.font = "400 16px 'IBM Plex Mono', monospace";
  ctx.fillText(stamp, 56, canvas.height - 56);
  ctx.fillText("SHA-256 will bind these pixels.", 56, canvas.height - 32);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
  const bytes = await blob.arrayBuffer();
  const previewUrl = URL.createObjectURL(blob);
  return {
    bytes,
    mimeType: "image/png",
    filename: `witness-sample-${stamp.replace(/[:.]/g, "-")}.png`,
    previewUrl,
  };
}
