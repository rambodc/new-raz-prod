import { eventCopyFromLine, themeForLine, THEMES, type EventCopy, type ThemeId } from "./theme";

export const SAMPLE_PHRASE = "Create Friday's event";
export const SAMPLE_HERE = 28;

export type Place = "artist" | "event";

export type DemoState = {
  place: Place;
  following: boolean;
  /** Sample "I'm here" already noted on this device. */
  present: boolean;
  hereCount: number;
  editing: boolean;
  voicePreview: boolean;
  line: string;
  committedLine: string;
  committedThemeId: ThemeId;
  stagedThemeId: ThemeId | null;
  eventTitle: string;
  eventWhen: string;
  committedTitle: string;
  committedWhen: string;
};

const FALLBACK: EventCopy = { title: "Friday", when: "9 PM" };

export function createDemo(): DemoState {
  return {
    place: "artist",
    following: false,
    present: false,
    hereCount: SAMPLE_HERE,
    editing: false,
    voicePreview: false,
    line: "",
    committedLine: "",
    committedThemeId: "raspberry",
    stagedThemeId: null,
    eventTitle: FALLBACK.title,
    eventWhen: FALLBACK.when,
    committedTitle: FALLBACK.title,
    committedWhen: FALLBACK.when,
  };
}

export function toggleFollow(state: DemoState): DemoState {
  return { ...state, following: !state.following };
}

export function enterEvent(state: DemoState): DemoState {
  return { ...state, place: "event", editing: false, voicePreview: false, stagedThemeId: null, line: state.committedLine, eventTitle: state.committedTitle, eventWhen: state.committedWhen };
}

export function leaveEvent(state: DemoState): DemoState {
  return { ...state, place: "artist" };
}

/** Notes a sample visit once. Does not read location or talk to a server. */
export function confirmHere(state: DemoState): DemoState {
  if (state.present) return state;
  return { ...state, present: true, hereCount: state.hereCount + 1 };
}

export function openEdit(state: DemoState): DemoState {
  return {
    ...state,
    place: "artist",
    editing: true,
    voicePreview: false,
    stagedThemeId: null,
    line: state.committedLine,
    eventTitle: state.committedTitle,
    eventWhen: state.committedWhen,
  };
}

export function cancelEdit(state: DemoState): DemoState {
  return {
    ...state,
    editing: false,
    voicePreview: false,
    stagedThemeId: null,
    line: state.committedLine,
    eventTitle: state.committedTitle,
    eventWhen: state.committedWhen,
  };
}

export function setLine(state: DemoState, line: string): DemoState {
  return { ...state, line: line.slice(0, 80) };
}

export function setVoicePreview(state: DemoState, on: boolean): DemoState {
  return { ...state, voicePreview: on };
}

export function insertSamplePhrase(state: DemoState): DemoState {
  return { ...state, line: SAMPLE_PHRASE };
}

export function previewEdit(state: DemoState): DemoState {
  const theme = themeForLine(state.line);
  const copy = eventCopyFromLine(state.line, { title: state.committedTitle, when: state.committedWhen });
  return { ...state, stagedThemeId: theme.id, eventTitle: copy.title, eventWhen: copy.when };
}

export function approveEdit(state: DemoState): DemoState {
  const themeId = state.stagedThemeId ?? themeForLine(state.line).id;
  const copy = eventCopyFromLine(state.line, { title: state.committedTitle, when: state.committedWhen });
  return {
    ...state,
    editing: false,
    voicePreview: false,
    stagedThemeId: null,
    line: state.line,
    committedLine: state.line,
    committedThemeId: themeId,
    committedTitle: copy.title,
    committedWhen: copy.when,
    eventTitle: copy.title,
    eventWhen: copy.when,
  };
}

export function activeTheme(state: DemoState) {
  const id = state.editing && state.stagedThemeId ? state.stagedThemeId : state.committedThemeId;
  return THEMES[id];
}

export function hereLabel(state: DemoState): string {
  return `${state.hereCount} here · sample`;
}
