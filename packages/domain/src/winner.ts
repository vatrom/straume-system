export type WinnerRoom = {
  name: string;
  floorName: string;
  perimeterM: number | null;
  ceilingHeightM: number | null;
  floorAreaM: number | null;
  walls: { number: number; lengthM: number }[];
  slope: { kneeHeightM: number; ridgeHeightM: number } | null;
};

export type WinnerNote = { body: string; internal: boolean; roomName?: string };

export function buildWinnerMail(input: {
  projectTitle: string;
  address: string;
  recipient: string;
  rooms: WinnerRoom[];
  notes: WinnerNote[];
}): { to: string; subject: string; text: string; internalNotesOmitted: number } {
  const visibleNotes = input.notes.filter((note) => note.internal === false);
  const omitted = input.notes.length - visibleNotes.length;
  const roomText = input.rooms
    .map((room) => {
      const walls = room.walls.map((wall) => `  Vegg ${wall.number}: ${wall.lengthM.toFixed(2)} m`).join("\n");
      const slope = room.slope
        ? `Skråtak: knelhøyde ${room.slope.kneeHeightM.toFixed(2)} m, møne ${room.slope.ridgeHeightM.toFixed(2)} m`
        : "Skråtak: nei";
      return [
        `${room.floorName} / ${room.name}`,
        `Omkrets: ${fmt(room.perimeterM)} m`,
        `Romhøyde: ${fmt(room.ceilingHeightM)} m`,
        `Gulvareal: ${fmt(room.floorAreaM)} m²`,
        slope,
        walls || "  Ingen veggmål",
      ].join("\n");
    })
    .join("\n\n");
  const noteText = visibleNotes.length
    ? visibleNotes.map((note) => `- ${note.roomName ? `${note.roomName}: ` : ""}${note.body}`).join("\n")
    : "Ingen notater merket for deling.";
  const text = [
    `Prosjekt: ${input.projectTitle}`,
    `Adresse: ${input.address}`,
    "",
    "Mål fra befaring (grunnlag for tegning i Winner):",
    roomText || "Ingen rom er målt ennå.",
    "",
    "Notater som kan deles:",
    noteText,
    "",
    "Interne notater er utelatt.",
  ].join("\n");
  return {
    to: input.recipient.trim(),
    subject: `Romskisse og mål: ${input.projectTitle}`,
    text,
    internalNotesOmitted: omitted,
  };
}

function fmt(value: number | null): string {
  return value == null ? "–" : value.toFixed(2);
}
