import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { combineLocal, dateInputValue, formatClock, formatDay, zoneParts } from "./format";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function firstWeekday(year: number, month: number): number {
  const instant = combineLocal(`${year}-${String(month).padStart(2, "0")}-01`, "12:00");
  return instant ? zoneParts(instant).weekday : 0;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function clockParts(time: string): { hour: number; minute: number; pm: boolean } {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  const hour24 = match ? Number(match[1]) : 21;
  const minute = match ? Number(match[2]) : 0;
  return { hour: hour24 % 12 || 12, minute, pm: hour24 >= 12 };
}

function toTime(hour: number, minute: number, pm: boolean): string {
  let hour24 = hour % 12;
  if (pm) hour24 += 12;
  return `${pad(hour24)}:${pad(minute)}`;
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="when-layer" onMouseDown={onClose}>
      <div className="when-card" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
        <div className="when-head">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="stage-text" onClick={onClose}>
            Done
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function DateSheet({ value, onChange, onClose }: { value: string; onChange: (value: string) => void; onClose: () => void }) {
  const today = dateInputValue(new Date());
  const seed = value || today;
  const [year, setYear] = useState(Number(seed.slice(0, 4)));
  const [month, setMonth] = useState(Number(seed.slice(5, 7)));
  const count = daysInMonth(year, month);
  const lead = firstWeekday(year, month);
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];

  function shift(delta: number) {
    const next = month + delta;
    if (next < 1) {
      setMonth(12);
      setYear((current) => current - 1);
      return;
    }
    if (next > 12) {
      setMonth(1);
      setYear((current) => current + 1);
      return;
    }
    setMonth(next);
  }

  return (
    <Sheet title="Date" onClose={onClose}>
      <div className="when-month">
        <button type="button" aria-label="Previous month" onClick={() => shift(-1)}>
          ‹
        </button>
        <strong>
          {MONTHS[month - 1]} {year}
        </strong>
        <button type="button" aria-label="Next month" onClick={() => shift(1)}>
          ›
        </button>
      </div>
      <div className="when-week" aria-hidden="true">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="when-grid" role="grid" aria-label="Choose a date">
        {cells.map((day, index) => {
          if (!day) return <span key={`e-${index}`} />;
          const iso = `${year}-${pad(month)}-${pad(day)}`;
          return (
            <button key={iso} type="button" role="gridcell" className={iso === value ? "is-on" : ""} aria-pressed={iso === value} onClick={() => onChange(iso)}>
              {day}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

function TimeSheet({ value, onChange, onClose }: { value: string; onChange: (value: string) => void; onClose: () => void }) {
  const parts = clockParts(value);
  const minutes = Array.from({ length: 12 }, (_, index) => index * 5);
  if (!minutes.includes(parts.minute)) minutes.push(parts.minute);
  minutes.sort((a, b) => a - b);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      document.querySelectorAll(".time-col").forEach((column) => {
        const selected = column.querySelector("button.is-on");
        if (!(column instanceof HTMLElement) || !(selected instanceof HTMLElement)) return;
        const top = selected.getBoundingClientRect().top - column.getBoundingClientRect().top + column.scrollTop;
        column.scrollTop = Math.max(0, top - column.clientHeight / 2 + selected.clientHeight / 2);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <Sheet title="Time" onClose={onClose}>
      <div className="time-cols">
        <div className="time-col" role="listbox" aria-label="Hour">
          {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
            <button key={hour} type="button" className={hour === parts.hour ? "is-on" : ""} aria-pressed={hour === parts.hour} onClick={() => onChange(toTime(hour, parts.minute, parts.pm))}>
              {hour}
            </button>
          ))}
        </div>
        <div className="time-col" role="listbox" aria-label="Minute">
          {minutes.map((minute) => (
            <button key={minute} type="button" className={minute === parts.minute ? "is-on" : ""} aria-pressed={minute === parts.minute} onClick={() => onChange(toTime(parts.hour, minute, parts.pm))}>
              {pad(minute)}
            </button>
          ))}
        </div>
        <div className="time-col" role="listbox" aria-label="AM or PM">
          {(["AM", "PM"] as const).map((label) => {
            const pm = label === "PM";
            return (
              <button key={label} type="button" className={pm === parts.pm ? "is-on" : ""} aria-pressed={pm === parts.pm} onClick={() => onChange(toTime(parts.hour, parts.minute, pm))}>
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}

export function WhenFields({ date, time, disabled, onDate, onTime }: { date: string; time: string; disabled: boolean; onDate: (value: string) => void; onTime: (value: string) => void }) {
  const [open, setOpen] = useState<"date" | "time" | null>(null);
  const selectedDay = date ? combineLocal(date, "12:00") : null;
  const selectedTime = time ? combineLocal("2026-01-15", time) : null;

  return (
    <div className="when-split">
      <div className="field">
        <span>Date</span>
        <button type="button" className={date ? "picker-value" : "picker-value is-empty"} disabled={disabled} aria-haspopup="dialog" onClick={() => setOpen("date")}>
          {selectedDay ? formatDay(selectedDay) : "Select date"}
        </button>
      </div>
      <div className="field">
        <span>Time</span>
        <button type="button" className={time ? "picker-value" : "picker-value is-empty"} disabled={disabled} aria-haspopup="dialog" onClick={() => setOpen("time")}>
          {selectedTime ? formatClock(selectedTime, "always") : "Select time"}
        </button>
      </div>
      {open === "date" ? (
        <DateSheet
          value={date}
          onChange={(next) => {
            onDate(next);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open === "time" ? <TimeSheet value={time || "21:00"} onChange={onTime} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
