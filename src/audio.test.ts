import { describe, expect, it } from "vitest";
import { audioKind } from "./audio";

function file(name: string, type: string) {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe("audio files", () => {
  it("accepts mp3, m4a, aac and wav", () => {
    expect(audioKind(file("song.mp3", "audio/mpeg"))).toEqual({ ext: "mp3", contentType: "audio/mpeg" });
    expect(audioKind(file("song.m4a", ""))).toEqual({ ext: "m4a", contentType: "audio/mp4" });
    expect(audioKind(file("song.aac", "audio/aac"))).toEqual({ ext: "aac", contentType: "audio/aac" });
    expect(audioKind(file("song.wav", "audio/x-wav"))).toEqual({ ext: "wav", contentType: "audio/x-wav" });
    expect(audioKind(file("voice", "audio/wav"))).toEqual({ ext: "wav", contentType: "audio/wav" });
  });

  it("rejects a non-audio file even with a music extension", () => {
    expect(audioKind(file("song.mp3", "text/html"))).toBeNull();
    expect(audioKind(file("notes.txt", "text/plain"))).toBeNull();
    expect(audioKind(file("cover.jpg", "image/jpeg"))).toBeNull();
  });
});
