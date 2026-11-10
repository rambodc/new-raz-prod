export const AUDIO_LIMIT = 30 * 1024 * 1024;
export const MAX_DURATION = 14400;

const EXTENSIONS: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
};

export function audioKind(file: File): { ext: string; contentType: string } | null {
  const named = (file.name.split(".").pop() || "").toLowerCase();
  const type = file.type.toLowerCase();
  if (type && !type.startsWith("audio/")) return null;
  let ext = named in EXTENSIONS ? named : "";
  if (!ext) {
    if (type === "audio/mpeg" || type === "audio/mp3") ext = "mp3";
    else if (type === "audio/mp4" || type === "audio/x-m4a" || type === "audio/m4a") ext = "m4a";
    else if (type === "audio/aac" || type === "audio/x-aac") ext = "aac";
    else if (type === "audio/wav" || type === "audio/wave" || type === "audio/x-wav") ext = "wav";
  }
  if (!ext) return null;
  const contentType = type.startsWith("audio/") ? type : EXTENSIONS[ext];
  return { ext, contentType };
}

export function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    let settled = false;
    const finish = (error?: Error, duration?: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      audio.removeAttribute("src");
      audio.load();
      if (error) reject(error);
      else resolve(duration ?? 0);
    };
    const timer = window.setTimeout(() => finish(new Error("Couldn't read that audio file.")), 8000);
    const accept = () => {
      const duration = audio.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        finish(new Error("Couldn't read the length of that file."));
        return;
      }
      if (duration > MAX_DURATION) {
        finish(new Error("That track is too long."));
        return;
      }
      finish(undefined, duration);
    };
    audio.addEventListener("error", () => finish(new Error("Couldn't read that audio file.")));
    audio.addEventListener("loadedmetadata", () => {
      if (audio.duration === Infinity) {
        const onTime = () => {
          audio.removeEventListener("timeupdate", onTime);
          accept();
        };
        audio.addEventListener("timeupdate", onTime);
        audio.currentTime = 1e101;
        return;
      }
      accept();
    });
    audio.src = url;
  });
}
