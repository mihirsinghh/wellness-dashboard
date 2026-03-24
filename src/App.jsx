import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Flame,
  Shield,
  Check,
  X,
  ArrowLeft,
  CalendarDays,
  ListTodo,
  Dumbbell,
  Wallet,
  BookOpen,
  Home,
  ChevronRight,
  Pencil,
  Trash2,
} from "lucide-react";

const DAYS = 30;
const HABITS_STORAGE_KEY = "stability-dashboard-habits-v3";
const TASKS_STORAGE_KEY = "stability-dashboard-tasks-v1";
const EXPENSES_STORAGE_KEY = "stability-dashboard-expenses-v1";
const EXPENSE_CATEGORIES_STORAGE_KEY = "stability-dashboard-expense-categories-v1";
const JOURNAL_STORAGE_KEY = "stability-dashboard-journal-v1";
const JOURNAL_FOLDERS_STORAGE_KEY = "stability-dashboard-journal-folders-v1";

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayLogIndex(length = DAYS) {
  return Math.max(0, Math.min(new Date().getDate() - 1, length - 1));
}

function getRelativeDateString(daysAgo = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCurrency(amount) {
  return `$${amount.toFixed(2)}`;
}

function formatExpenseDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatLongDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function isDateToday(dateString) {
  return dateString === getTodayDateString();
}

function isDateWithinLastDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return date >= start;
}

function buildBinaryHistory(indices = []) {
  return Array.from({ length: DAYS }, (_, i) => indices.includes(i));
}

function getDateLabelFromIndex(index) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const date = new Date(start);
  date.setDate(start.getDate() + index);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getShortAxisLabel(index) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const date = new Date(start);
  date.setDate(start.getDate() + index);
  return date.getDate();
}

function getMonthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function getMonthKeyFromOffset(offsetMonths = 0) {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offsetMonths);
  return getMonthKey(date);
}

function parseMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return { year, monthIndex: month - 1 };
}

function getMonthLabel(monthKey, short = false) {
  const { year, monthIndex } = parseMonthKey(monthKey);
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
    month: short ? "short" : "long",
    year: "numeric",
  });
}

function getDateLabelFromMonthKey(monthKey, index) {
  const { year, monthIndex } = parseMonthKey(monthKey);
  const date = new Date(year, monthIndex, 1);
  date.setDate(index + 1);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getCurrentMonthLabel() {
  return new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function getJournalPreview(body = "", maxLength = 110) {
  const cleanBody = body.replace(/\s+/g, " ").trim();
  if (!cleanBody) return "Start writing when you are ready.";
  if (cleanBody.length <= maxLength) return cleanBody;
  return `${cleanBody.slice(0, maxLength).trimEnd()}...`;
}

const journalPromptPool = [
  "What emotion asked for most of my attention today, and how did I respond to it?",
  "Where did I feel most like myself today?",
  "What discomfort did I avoid, and what might it be trying to teach me?",
  "What helped me feel steadier than I expected today?",
  "When did I act from fear instead of clarity?",
  "What story about myself felt strongest today, and is it actually true?",
  "What am I carrying right now that I may not need to keep carrying?",
  "Where did I notice self-respect growing in a small way today?",
  "What moment today felt more tender, honest, or alive than the rest?",
  "What pattern keeps repeating in my inner life lately?",
  "What did I need today that I had trouble admitting?",
  "Where was I gentler with myself than I used to be?",
  "What choice today moved me toward the person I want to become?",
  "What drained me today, and what restored me even a little?",
  "If I slowed down and told myself the truth, what would I say?",
  "What am I learning about my needs, limits, or values right now?",
  "What did I judge in myself today, and what sits underneath that judgment?",
  "What would it look like to relate to this season of life with more patience?",
];

function getRandomJournalPrompts(count = 3) {
  const shuffled = [...journalPromptPool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function loadStoredValue(storageKey, fallbackValue, normalizeValue) {
  if (typeof window === "undefined") return fallbackValue;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return fallbackValue;
    const parsed = JSON.parse(stored);
    return normalizeValue ? normalizeValue(parsed) : parsed;
  } catch {
    return fallbackValue;
  }
}

function getHabitHistory(habit) {
  const currentMonthKey = getMonthKey();
  return {
    ...(habit.history ?? {}),
    [currentMonthKey]: habit.history?.[currentMonthKey] ?? habit.logs ?? [],
  };
}

function getHabitYears(habit) {
  return [...new Set(Object.keys(getHabitHistory(habit)).map((key) => Number(key.slice(0, 4))))].sort((a, b) => b - a);
}

function normalizeHabit(habit) {
  const history = getHabitHistory(habit);
  const monthKey = getMonthKey();
  return {
    ...habit,
    history,
    logs: history[monthKey] ?? habit.logs ?? [],
  };
}

const initialHabits = [
  {
    id: "meditation",
    name: "Morning Meditation",
    emoji: "🧘",
    type: "build",
    target: { mode: "daily", frequency: 1, period: "day", label: "Daily" },
    logs: buildBinaryHistory([22, 23, 24, 25, 27, 28, 29]),
    history: {
      [getMonthKey()]: buildBinaryHistory([22, 23, 24, 25, 27, 28, 29]),
      [getMonthKeyFromOffset(-1)]: buildBinaryHistory([12, 13, 14, 18, 20, 21, 23, 24, 25]),
      [getMonthKeyFromOffset(-12)]: buildBinaryHistory([8, 9, 10, 14, 16, 19, 22, 23]),
    },
    notes: "Sit, settle, and practice consistency over intensity.",
    color: "emerald",
  },
  {
    id: "journal",
    name: "Daily Journal",
    emoji: "📔",
    type: "build",
    target: { mode: "daily", frequency: 1, period: "day", label: "Daily" },
    logs: buildBinaryHistory([19, 20, 22, 23, 24, 25, 26, 28, 29]),
    history: {
      [getMonthKey()]: buildBinaryHistory([19, 20, 22, 23, 24, 25, 26, 28, 29]),
      [getMonthKeyFromOffset(-1)]: buildBinaryHistory([10, 11, 14, 15, 16, 21, 24, 25]),
      [getMonthKeyFromOffset(-12)]: buildBinaryHistory([5, 6, 7, 13, 18, 19, 21]),
    },
    notes: "Track what reduced suffering and what helped stability.",
    color: "emerald",
  },
  {
    id: "exercise",
    name: "Exercise",
    emoji: "🏋️",
    type: "build",
    target: { mode: "daily", frequency: 1, period: "day", label: "Today counts if I moved" },
    logs: buildBinaryHistory([10, 11, 14, 17, 20, 23, 25, 27, 29]),
    history: {
      [getMonthKey()]: buildBinaryHistory([10, 11, 14, 17, 20, 23, 25, 27, 29]),
      [getMonthKeyFromOffset(-1)]: buildBinaryHistory([3, 7, 12, 16, 19, 22, 26]),
      [getMonthKeyFromOffset(-12)]: buildBinaryHistory([4, 6, 11, 17, 18, 21, 24, 28]),
    },
    notes: "Counts gym, tennis, or mobility flow.",
    color: "emerald",
  },
  {
    id: "weed",
    name: "Quit Weed",
    emoji: "🚭",
    type: "reduce",
    target: { mode: "limit", frequency: 0, period: "day", label: "Max 0 / day" },
    logs: Array.from({ length: DAYS }, (_, i) => ([3, 14, 21].includes(i) ? 1 : 0)),
    history: {
      [getMonthKey()]: Array.from({ length: DAYS }, (_, i) => ([3, 14, 21].includes(i) ? 1 : 0)),
      [getMonthKeyFromOffset(-1)]: Array.from({ length: DAYS }, (_, i) => ([5, 6, 20].includes(i) ? 1 : 0)),
      [getMonthKeyFromOffset(-12)]: Array.from({ length: DAYS }, (_, i) => ([11, 25].includes(i) ? 1 : 0)),
    },
    notes: "Track sober days and daily compliance.",
    color: "amber",
  },
  {
    id: "icecream",
    name: "Ice Cream",
    emoji: "🍨",
    type: "reduce",
    target: { mode: "limit", frequency: 1, period: "week", label: "Max 1 / week" },
    logs: Array.from({ length: DAYS }, (_, i) => ([6, 13, 26].includes(i) ? 1 : 0)),
    history: {
      [getMonthKey()]: Array.from({ length: DAYS }, (_, i) => ([6, 13, 26].includes(i) ? 1 : 0)),
      [getMonthKeyFromOffset(-1)]: Array.from({ length: DAYS }, (_, i) => ([5, 19, 27].includes(i) ? 1 : 0)),
      [getMonthKeyFromOffset(-12)]: Array.from({ length: DAYS }, (_, i) => ([2, 17].includes(i) ? 1 : 0)),
    },
    notes: "Measure success by how many weeks stay within your cap.",
    color: "amber",
  },
  {
    id: "screen",
    name: "Screen Time",
    emoji: "📱",
    type: "reduce",
    target: { mode: "limit", frequency: 2, period: "day", label: "Max 2 / day" },
    logs: Array.from({ length: DAYS }, (_, i) => ([4, 18, 24, 27].includes(i) ? 3 : 1)),
    history: {
      [getMonthKey()]: Array.from({ length: DAYS }, (_, i) => ([4, 18, 24, 27].includes(i) ? 3 : 1)),
      [getMonthKeyFromOffset(-1)]: Array.from({ length: DAYS }, (_, i) => ([8, 16, 23].includes(i) ? 3 : 1)),
      [getMonthKeyFromOffset(-12)]: Array.from({ length: DAYS }, (_, i) => ([12, 13, 14].includes(i) ? 3 : 1)),
    },
    notes: "Track days where usage stays within your chosen cap.",
    color: "amber",
  },
];

const initialTasks = [
  { id: "task-1", text: "Finish philosophy reading", done: true, createdAt: getRelativeDateString(4), completedAt: getRelativeDateString(2) },
  { id: "task-2", text: "Tennis practice at 4 PM", done: false, createdAt: getRelativeDateString(0), completedAt: null },
  { id: "task-3", text: "Review internship planning notes", done: false, createdAt: getRelativeDateString(1), completedAt: null },
  { id: "task-4", text: "Reply to internship email", done: true, createdAt: getRelativeDateString(6), completedAt: getRelativeDateString(6) },
  { id: "task-5", text: "Plan tomorrow's workout", done: true, createdAt: getRelativeDateString(8), completedAt: getRelativeDateString(8) },
];

const initialExpenses = [
  { id: "exp-1", label: "Groceries", amount: 48.2, category: "Food", date: getRelativeDateString(1) },
  { id: "exp-2", label: "Coffee", amount: 6.75, category: "Cafe", date: getRelativeDateString(0) },
  { id: "exp-3", label: "Tennis strings", amount: 24, category: "Sport", date: getRelativeDateString(4) },
  { id: "exp-4", label: "Lunch", amount: 15.5, category: "Food", date: getRelativeDateString(6) },
  { id: "exp-5", label: "Protein bars", amount: 12.25, category: "Fitness", date: getRelativeDateString(8) },
  { id: "exp-6", label: "Books", amount: 31, category: "Learning", date: getRelativeDateString(10) },
];

const initialExpenseCategories = ["Food", "Cafe", "Sport", "Fitness", "Learning", "General"];

const initialJournalEntries = [
  {
    id: "j-1",
    title: "What reduced suffering today?",
    body: "Noticing urges without acting on them made the evening softer. I did better when I focused on the next right action instead of trying to feel perfect.",
    date: getRelativeDateString(0),
    updatedAt: `${getRelativeDateString(0)}T20:15:00`,
    folderId: "folder-reflection",
  },
  {
    id: "j-2",
    title: "Current insight",
    body: "Stability matters more than chasing intense understanding. The days feel lighter when I protect sleep, movement, and honest reflection first.",
    date: getRelativeDateString(2),
    updatedAt: `${getRelativeDateString(2)}T08:30:00`,
    folderId: "folder-insights",
  },
];

const initialJournalFolders = [
  { id: "folder-reflection", name: "Reflections" },
  { id: "folder-insights", name: "Insights" },
];

const palette = {
  emerald: {
    text: "text-emerald-600",
    pill: "bg-emerald-100",
    button: "bg-emerald-500 hover:bg-emerald-600",
    stroke: "#10b981",
  },
  amber: {
    text: "text-amber-500",
    pill: "bg-amber-100",
    button: "bg-amber-500 hover:bg-amber-600",
    stroke: "#f59e0b",
  },
};

function chunkByPeriod(logs, period) {
  if (period === "week") {
    const chunks = [];
    for (let i = 0; i < logs.length; i += 7) chunks.push(logs.slice(i, i + 7));
    return chunks;
  }
  if (period === "month") return [logs];
  return logs.map((value) => [value]);
}

function getCurrentStreak(items) {
  let count = 0;
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (!items[i]) break;
    count += 1;
  }
  return count;
}

function getBestStreak(items) {
  let best = 0;
  let running = 0;
  items.forEach((ok) => {
    if (ok) {
      running += 1;
      best = Math.max(best, running);
    } else {
      running = 0;
    }
  });
  return best;
}

function buildConsecutiveChart(points, axisMode = "days") {
  let streak = 0;
  return points.map((success, idx) => {
    streak = success ? streak + 1 : 0;
    return {
      day: idx + 1,
      value: streak,
      success,
      dateLabel:
        axisMode === "days"
          ? getDateLabelFromIndex(idx)
          : `${axisMode === "weeks" ? "Week" : "Month"} ${idx + 1}`,
    };
  });
}

function formatStreakLabel(count, unit) {
  return `${count} ${unit}${count === 1 ? "" : "s"} streak`;
}

function getVisibleMonthLogs(logs = []) {
  return logs.slice(0, Math.min(new Date().getDate(), logs.length));
}

function getBuildMetrics(habit) {
  const visibleLogs = getVisibleMonthLogs(habit.logs);
  const successes = visibleLogs.map((v) => Boolean(v));
  const recent7 = successes.slice(-7).filter(Boolean).length;
  const totalSuccessful = successes.filter(Boolean).length;
  const currentStreak = getCurrentStreak(successes);
  const bestStreak = getBestStreak(successes);

  return {
    currentStreak,
    bestStreak,
    consistency7: Math.round((recent7 / Math.min(7, successes.length || 1)) * 100),
    consistency30: Math.round((totalSuccessful / Math.max(successes.length, 1)) * 100),
    completedToday: Boolean(successes[successes.length - 1]),
    chartData: buildConsecutiveChart(successes, "days"),
    summaryValue: formatStreakLabel(currentStreak, "day"),
    totalSuccessful,
    chartXAxisMode: "days",
    chartSummaryLabel: `${totalSuccessful} successful days this month`,
    periodSuccesses: recent7,
    periodSummaryLabel: "Successful days this week",
  };
}

function getReduceMetrics(habit) {
  const { frequency, period, label } = habit.target;
  const visibleLogs = getVisibleMonthLogs(habit.logs);
  const grouped = chunkByPeriod(visibleLogs, period);
  const compliant = grouped.map((chunk) => chunk.reduce((sum, value) => sum + value, 0) <= frequency);
  const totalSuccessful = compliant.filter(Boolean).length;
  const recent7 = compliant.slice(-7).filter(Boolean).length;
  const currentStreak = getCurrentStreak(compliant);
  const bestStreak = getBestStreak(compliant);
  const axisMode = period === "week" ? "weeks" : period === "month" ? "months" : "days";
  const streakUnit = period === "week" ? "week" : period === "month" ? "month" : "day";

  return {
    currentStreak,
    bestStreak,
    consistency7: Math.round((recent7 / Math.min(7, compliant.length || 1)) * 100),
    consistency30: Math.round((totalSuccessful / Math.max(compliant.length, 1)) * 100),
    completedToday: Boolean(compliant[compliant.length - 1]),
    chartData: buildConsecutiveChart(compliant, axisMode),
    summaryValue: formatStreakLabel(currentStreak, streakUnit),
    targetLabel: label,
    totalSuccessful,
    chartXAxisMode: axisMode,
    chartSummaryLabel: `${totalSuccessful} successful ${period === "week" ? "weeks" : period === "month" ? "months" : "days"} this month`,
    periodSuccesses: grouped[grouped.length - 1]?.reduce((sum, value) => sum + value, 0) ?? 0,
    periodSummaryLabel: period === "week" ? "Uses this week" : period === "month" ? "Uses this month" : "Uses today",
  };
}

function getHabitMetrics(habit) {
  return habit.type === "build" ? getBuildMetrics(habit) : getReduceMetrics(habit);
}

function getHabitCubeData(habit, monthKey = getMonthKey()) {
  const history = getHabitHistory(habit);
  const monthLogs = history[monthKey] ?? [];
  const isCurrentMonth = monthKey === getMonthKey();
  const visibleCount = isCurrentMonth ? Math.min(new Date().getDate(), monthLogs.length) : monthLogs.length;
  const visibleLogs = monthLogs.slice(0, visibleCount);

  if (habit.type === "build") {
    return visibleLogs.map((value, index) => ({
      day: index + 1,
      success: Boolean(value),
      level: Boolean(value) ? 3 : 0,
      dateLabel: getDateLabelFromMonthKey(monthKey, index),
      statusLabel: Boolean(value) ? "completed" : "missed",
    }));
  }

  const { frequency, period } = habit.target;

  if (period === "day") {
    return visibleLogs.map((value, index) => ({
      day: index + 1,
      success: value <= frequency,
      level: value <= frequency ? Math.max(1, 3 - Math.min(value, 2)) : 0,
      dateLabel: getDateLabelFromMonthKey(monthKey, index),
      statusLabel: `${value} / ${frequency} uses`,
    }));
  }

  if (period === "week") {
    return visibleLogs.map((value, index) => {
      const chunkStart = Math.floor(index / 7) * 7;
      const chunk = visibleLogs.slice(chunkStart, chunkStart + 7);
      const partialChunk = visibleLogs.slice(chunkStart, index + 1);
      const weeklyTotal = chunk.reduce((sum, item) => sum + item, 0);
      const runningTotal = partialChunk.reduce((sum, item) => sum + item, 0);
      return {
        day: index + 1,
        success: weeklyTotal <= frequency,
        level: runningTotal <= frequency ? Math.max(1, 3 - Math.min(runningTotal, 2)) : 0,
        dateLabel: getDateLabelFromMonthKey(monthKey, index),
        statusLabel: `week total ${runningTotal} / ${frequency}`,
      };
    });
  }

  const monthSuccess = visibleLogs.reduce((sum, value) => sum + value, 0) <= frequency;
  return visibleLogs.map((_, index) => ({
    day: index + 1,
    success: monthSuccess,
    level: monthSuccess ? 2 : 0,
    dateLabel: getDateLabelFromMonthKey(monthKey, index),
    statusLabel: monthSuccess ? "within monthly target" : "over monthly target",
  }));
}

function getHabitWeekData(habit, monthKey = getMonthKey()) {
  const history = getHabitHistory(habit);
  const monthLogs = history[monthKey] ?? [];
  const isCurrentMonth = monthKey === getMonthKey();
  const visibleCount = isCurrentMonth ? Math.min(new Date().getDate(), monthLogs.length) : monthLogs.length;
  const visibleLogs = monthLogs.slice(0, visibleCount);
  const weeklyChunks = [];

  for (let start = 0; start < visibleLogs.length; start += 7) {
    const chunk = visibleLogs.slice(start, start + 7);
    const total = chunk.reduce((sum, value) => sum + value, 0);
    const end = Math.min(start + chunk.length - 1, monthLogs.length - 1);

    weeklyChunks.push({
      week: Math.floor(start / 7) + 1,
      total,
      success: total <= habit.target.frequency,
      startLabel: getDateLabelFromMonthKey(monthKey, start),
      endLabel: getDateLabelFromMonthKey(monthKey, end),
    });
  }

  return weeklyChunks;
}

function getLinePoints(data, width, height, padX = 18, padY = 16) {
  const safeData = data.length > 0 ? data : [{ day: 1, value: 0, success: false, dateLabel: "Day 1" }];
  const maxX = Math.max(...safeData.map((d) => d.day), 1);
  const maxY = Math.max(...safeData.map((d) => d.value), 1);
  return safeData.map((d) => ({
    x: padX + ((d.day - 1) / Math.max(maxX - 1, 1)) * (width - padX * 2),
    y: height - padY - (d.value / maxY) * (height - padY * 2),
    value: d.value,
    day: d.day,
    success: d.success,
    dateLabel: d.dateLabel,
  }));
}

function getXAxisTicks(data, mode) {
  if (mode === "weeks" || mode === "months") return data.map((d) => d.day);
  return [1, 10, 20, 30].filter((tick) => tick <= Math.max(data.length, 1));
}

function getHabitTitleStyle(name = "") {
  const length = name.trim().length;
  const desktopSize = Math.max(10, 26 - Math.max(0, length - 10) * 0.8);
  const mobileSize = Math.max(10, 21 - Math.max(0, length - 10) * 0.65);
  return {
    fontSize: `clamp(${mobileSize}px, ${mobileSize}px + 0.3vw, ${desktopSize}px)`,
    lineHeight: 1.1,
    letterSpacing: "-0.02em",
  };
}

function LineChart({ data, xLabelMode = "days", color = "#10b981", compact = false }) {
  const width = 520;
  const height = 190;
  const leftLabelPad = compact ? 12 : 24;
  const points = getLinePoints(data, width, height);
  const [hovered, setHovered] = useState(null);
  const path = points.map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const maxY = Math.max(...(data.length ? data : [{ value: 0 }]).map((d) => d.value), 1);
  const yTicks = Array.from(new Set([0, Math.ceil(maxY / 2), maxY])).sort((a, b) => a - b);
  const xTicks = getXAxisTicks(data, xLabelMode);

  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        {!compact ? (
          <div className="flex items-center">
            <span className="-rotate-90 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Streak
            </span>
          </div>
        ) : null}
        <div className="relative flex-1">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[190px] w-full overflow-visible">
          {!compact ? <line x1={leftLabelPad} y1="16" x2={leftLabelPad} y2={height - 16} stroke="#a1a1aa" strokeWidth="1.2" /> : null}
          {!compact ? <line x1={leftLabelPad} y1={height - 16} x2={width - 18} y2={height - 16} stroke="#a1a1aa" strokeWidth="1.2" /> : null}
          {!compact ? yTicks.map((tick) => {
            const y = height - 16 - (tick / Math.max(maxY, 1)) * (height - 32);
            return (
              <g key={tick}>
                <line x1={leftLabelPad} y1={y} x2={width - 18} y2={y} stroke="#d4d4d8" strokeWidth="1" />
                <text x="2" y={y + 4} fontSize="11" fill="#a1a1aa">{tick}</text>
              </g>
            );
          }) : null}
          <path d={path} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
          {points.map((p) => (
            <g key={`${p.day}-${p.value}`}>
              <circle cx={p.x} cy={p.y} r="8" fill="transparent" onMouseEnter={() => setHovered(p)} onMouseLeave={() => setHovered(null)} />
              <circle cx={p.x} cy={p.y} r="4" fill={color} onMouseEnter={() => setHovered(p)} onMouseLeave={() => setHovered(null)} />
            </g>
          ))}
        </svg>
        {hovered ? (
          <div
            className="pointer-events-none absolute rounded-2xl bg-emerald-950 px-3 py-2 text-sm text-white shadow-xl"
            style={{ left: `${(hovered.x / width) * 100}%`, top: `${(hovered.y / height) * 100 - 18}%`, transform: "translate(-50%, -100%)" }}
          >
            <div className="font-semibold">{hovered.dateLabel}</div>
            <div>{hovered.value} consecutive successful {xLabelMode === "days" ? "days" : xLabelMode === "weeks" ? "weeks" : "months"}</div>
          </div>
        ) : null}
      </div>
      </div>
      {!compact ? (
        <>
          <div className="ml-9 flex items-center justify-between px-1 text-xs text-zinc-500">
            {xTicks.map((tick) => (
              <span key={tick}>{xLabelMode === "weeks" ? `W${tick}` : xLabelMode === "months" ? `M${tick}` : getShortAxisLabel(tick - 1)}</span>
            ))}
          </div>
          <div className="ml-9 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            {xLabelMode === "days" ? "Day of month" : xLabelMode === "weeks" ? "Week" : "Month"}
          </div>
        </>
      ) : null}
    </div>
  );
}

function HabitCubeGrid({ habit, compact = false, monthKey = getMonthKey(), headerMode = "full" }) {
  const colors = palette[habit.color];
  const cubes = getHabitCubeData(habit, monthKey);
  const weeklyTiles = habit.type === "reduce" && habit.target.period === "week" ? getHabitWeekData(habit, monthKey) : [];
  const monthLabel = getMonthLabel(monthKey);
  const gapClass = compact ? "gap-1" : "gap-2";
  const squareClass = compact ? "rounded-[0.2rem]" : "rounded-[0.45rem]";
  const innerSquareClass = compact ? "rounded-[0.15rem]" : "rounded-[0.4rem]";

  const getCubeFillClass = (cube) => {
    if (habit.type === "reduce") return cube.success ? "bg-emerald-500" : "bg-rose-500";
    if (!cube.success) return "bg-zinc-100";
    return cube.level >= 3 ? "bg-emerald-500" : cube.level === 2 ? "bg-emerald-400" : "bg-emerald-300";
  };

  return (
    <div className="space-y-3">
      {headerMode !== "none" ? (
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          <span>{monthLabel}</span>
          {headerMode === "full" ? <span>{habit.target.period === "week" ? habit.target.label : "Daily history"}</span> : null}
        </div>
      ) : null}
      {weeklyTiles.length > 0 ? (
        <>
          <div className={`grid ${compact ? "gap-2" : "gap-3"}`}>
            {weeklyTiles.map((tile) => (
              <div
                key={`${habit.id}-${monthKey}-week-${tile.week}`}
                title={`${tile.startLabel} - ${tile.endLabel}: ${tile.total} / ${habit.target.frequency} uses`}
                className={`rounded-[1rem] border px-4 py-3 ${
                  tile.success ? "border-emerald-300 bg-emerald-100/80" : "border-rose-300 bg-rose-100/80"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Week {tile.week}</div>
                    <div className="mt-1 text-sm text-zinc-700">{tile.startLabel} - {tile.endLabel}</div>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-sm font-semibold ${tile.success ? "bg-emerald-500 text-black" : "bg-rose-500 text-white"}`}>
                    {tile.total} / {habit.target.frequency}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>{weeklyTiles.length} weekly checks</span>
            <span>{weeklyTiles.filter((tile) => tile.success).length} within target</span>
          </div>
        </>
      ) : (
        <>
          <div className={`grid grid-cols-7 ${gapClass}`}>
            {cubes.map((cube) => (
              <div
                key={`${habit.id}-${cube.day}`}
                title={`${cube.dateLabel}: ${cube.statusLabel}`}
                className={`aspect-square border ${squareClass} ${
                  habit.type === "reduce"
                    ? cube.success
                      ? "border-transparent bg-emerald-100"
                      : "border-transparent bg-rose-100"
                    : cube.success
                      ? `${colors.pill} border-transparent`
                      : "border-zinc-200 bg-white"
                }`}
              >
                <div
                  className={`h-full w-full ${innerSquareClass} ${getCubeFillClass(cube)}`}
                  style={{ opacity: cube.success ? 1 : 0.7 }}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>1</span>
            <span>{cubes.length}</span>
          </div>
        </>
      )}
    </div>
  );
}

function HabitYearGrid({ habit }) {
  const years = getHabitYears(habit);
  const [selectedYear, setSelectedYear] = useState(years[0] ?? new Date().getFullYear());
  const currentYear = new Date().getFullYear();
  const currentMonthIndex = new Date().getMonth();
  const monthsToShow = Array.from({ length: selectedYear === currentYear ? currentMonthIndex + 1 : 12 }, (_, index) =>
    getMonthKey(new Date(selectedYear, index, 1))
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-lg text-emerald-900/60">Monthly distributions by year</div>
        <div className="inline-flex rounded-full bg-zinc-100 p-1">
          {years.map((year) => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${selectedYear === year ? "bg-zinc-950 text-white" : "text-zinc-700 hover:bg-white"}`}
            >
              {year}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {monthsToShow.map((monthKey) => (
          <div key={monthKey} className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-4">
            <HabitCubeGrid habit={habit} monthKey={monthKey} compact headerMode="compact" />
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, suffix }) {
  return (
    <div className="flex min-h-[160px] flex-col justify-between rounded-[2rem] border border-white/70 bg-white/95 p-8 shadow-sm ring-1 ring-black/5">
      <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">{label}</div>
      <div className="text-5xl font-bold leading-tight text-zinc-950">
        {value}
        {suffix ? <span className="ml-1 text-3xl text-zinc-600">{suffix}</span> : null}
      </div>
    </div>
  );
}

function ModuleCard({ icon: Icon, title, subtitle, onClick, accent = "emerald", rightText }) {
  const accentMap = accent === "amber" ? "bg-amber-100 text-amber-600" : accent === "sky" ? "bg-sky-100 text-sky-600" : "bg-emerald-100 text-emerald-600";
  return (
    <button onClick={onClick} className="homepage-module-card w-full rounded-[2rem] border border-white/70 bg-white/95 p-6 text-left shadow-sm ring-1 ring-black/5 transition hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className={`homepage-module-accent flex h-14 w-14 items-center justify-center rounded-2xl ${accentMap}`}>
            <Icon size={24} />
          </div>
          <div>
            <div className="text-2xl font-semibold leading-snug text-zinc-950">{title}</div>
            <div className="mt-2 text-base leading-7 text-zinc-700">{subtitle}</div>
          </div>
        </div>
        <ChevronRight size={20} className="shrink-0 text-zinc-500" />
      </div>
    </button>
  );
}

function HabitCard({ habit, metrics, onSelect, onQuickToggle, onOpenLogModal, onEdit, onDelete }) {
  const colors = palette[habit.color];
  const isBuild = habit.type === "build";
  const percentLabel = `${metrics.consistency30}%`;
  const titleStyle = getHabitTitleStyle(habit.name);

  return (
    <button onClick={() => onSelect(habit)} className="w-full rounded-[2rem] border border-white/70 bg-white/95 p-6 text-left shadow-sm ring-1 ring-black/5 transition hover:shadow-md">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.75rem] ${colors.pill} text-4xl shadow-sm`}>{habit.emoji}</div>
          <div className="min-w-0 flex-1">
            <div className="w-full whitespace-nowrap font-semibold text-zinc-950" style={titleStyle}>{habit.name}</div>
            <div className={`mt-2 flex items-center gap-2 text-base ${metrics.completedToday ? colors.text : "text-zinc-500"}`}>
              {isBuild ? <Flame size={16} /> : <Shield size={16} />}
              <span>{metrics.summaryValue}</span>
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="mb-3 flex justify-end gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(habit);
              }}
              className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
              aria-label={`Edit ${habit.name}`}
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(habit.id);
              }}
              className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-600 transition hover:bg-red-50 hover:text-red-600"
              aria-label={`Delete ${habit.name}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[1.75rem] bg-zinc-50/90 p-4 ring-1 ring-zinc-100">
        <HabitCubeGrid habit={habit} headerMode="compact" />
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-zinc-950">{percentLabel} success rate</div>
          <div className="text-sm text-zinc-600">
            {habit.type === "reduce" && habit.target.period === "week" ? "Measured by week, not individual days" : metrics.summaryValue}
          </div>
        </div>
        {isBuild ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQuickToggle(habit.id);
            }}
            className={`rounded-full border px-5 py-2.5 text-base font-semibold shadow-sm transition ${metrics.completedToday ? `${colors.button} border-transparent text-white` : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`}
          >
            {metrics.completedToday ? <span className="inline-flex items-center gap-2"><Check size={16} /> Done</span> : <span className="inline-flex items-center gap-2">Mark</span>}
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenLogModal(habit);
            }}
            className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-base font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50"
          >
            Log count
          </button>
        )}
      </div>
    </button>
  );
}

function SectionHeader({ title, color, onBack }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className={`h-10 w-3 rounded-full ${color}`} />
        <h2 className="text-4xl font-bold text-emerald-950">{title}</h2>
      </div>
      {onBack ? (
        <button onClick={onBack} className="inline-flex items-center gap-2 font-medium text-emerald-900/70 hover:text-emerald-950">
          <Home size={18} /> Dashboard
        </button>
      ) : null}
    </div>
  );
}

function DetailView({ habit, metrics, onBack, onQuickToggle, onOpenLogModal, onEdit, onDelete }) {
  const colors = palette[habit.color];
  const suffix = metrics.chartXAxisMode === "weeks" ? "weeks" : metrics.chartXAxisMode === "months" ? "months" : "days";
  const isBuild = habit.type === "build";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.12),transparent_25%),linear-gradient(135deg,#f6f8f3_0%,#eef4ef_45%,#f8efe3_100%)] px-6 py-8 md:px-10 lg:px-14">
      <div className="mx-auto max-w-6xl space-y-8">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-lg font-medium text-emerald-900/70 hover:text-emerald-950"><ArrowLeft size={20} /> Back to habits</button>

        <div className="rounded-[2rem] bg-white/80 p-8 shadow-sm ring-1 ring-black/5 md:p-10">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-5">
              <div className={`flex h-20 w-20 items-center justify-center rounded-3xl ${colors.pill} text-4xl shadow-sm`}>{habit.emoji}</div>
              <div>
                <div className="text-4xl font-bold text-emerald-950 md:text-5xl">{habit.name}</div>
                <div className={`mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-base ${colors.pill} ${colors.text}`}>
                  {habit.type === "build" ? <Flame size={16} /> : <Shield size={16} />}
                  {habit.type === "build" ? "Build habit" : "Reduce / quit habit"}
                </div>
                <p className="mt-5 max-w-2xl text-lg text-emerald-900/70">{habit.notes}</p>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <button onClick={() => onEdit(habit)} className="rounded-full border border-zinc-300 bg-white px-5 py-4 text-lg font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50">
                Edit habit
              </button>
              <button onClick={() => onDelete(habit.id)} className="rounded-full border border-red-200 bg-red-50 px-5 py-4 text-lg font-semibold text-red-600 shadow-sm transition hover:bg-red-100">
                Delete
              </button>
              {isBuild ? (
                <button onClick={() => onQuickToggle(habit.id)} className={`rounded-full px-6 py-4 text-lg font-semibold shadow-sm transition ${metrics.completedToday ? `${colors.button} text-white` : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"}`}>
                  {metrics.completedToday ? "Logged for today" : "Log today"}
                </button>
              ) : (
                <button onClick={() => onOpenLogModal(habit)} className="rounded-full border border-zinc-300 bg-white px-6 py-4 text-lg font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50">
                  Log actual count
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-4">
          <StatCard label="Current streak" value={metrics.currentStreak} suffix={suffix} />
          <StatCard label="Best streak" value={metrics.bestStreak} suffix={suffix} />
          <StatCard label="Success rate" value={metrics.consistency30} suffix="%" />
          <StatCard label={metrics.periodSummaryLabel} value={metrics.periodSuccesses} />
        </div>

        <div className="rounded-[2rem] bg-white/80 p-8 shadow-sm ring-1 ring-black/5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-3xl font-bold text-emerald-950">Monthly cubes</h3>
            <div className="text-lg text-emerald-900/60">Daily success up through today</div>
          </div>
          <div className="max-w-[18rem]">
            <HabitCubeGrid habit={habit} compact headerMode="compact" />
          </div>
        </div>

        <div className="rounded-[2rem] bg-white/80 p-8 shadow-sm ring-1 ring-black/5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-3xl font-bold text-emerald-950">Yearly view</h3>
            <div className="text-lg text-emerald-900/60">Monthly tile distributions across saved years</div>
          </div>
          <HabitYearGrid habit={habit} />
        </div>

        <div className="space-y-6 rounded-[2rem] bg-white/80 p-8 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-3xl font-bold text-emerald-950">Progress chart</h3>
            <div className="text-lg text-emerald-900/60">{metrics.chartSummaryLabel}</div>
          </div>
          <LineChart data={metrics.chartData} xLabelMode={metrics.chartXAxisMode} color={colors.stroke} />
        </div>
      </div>
    </div>
  );
}

function AddHabitModal({ onClose, onSave, initialHabit = null }) {
  const [form, setForm] = useState(() => ({
    name: initialHabit?.name ?? "",
    emoji: initialHabit?.emoji ?? "✨",
    type: initialHabit?.type ?? "build",
    frequency: initialHabit?.target?.frequency ?? 1,
    period: initialHabit?.target?.period ?? "day",
    notes: initialHabit?.notes ?? "",
  }));
  const targetLabel = form.type === "build" ? (form.period === "day" ? "Daily" : `${form.frequency} / ${form.period}`) : `Max ${form.frequency} / ${form.period}`;
  const isEditing = Boolean(initialHabit);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center py-6">
        <div className="w-full max-w-xl rounded-[2rem] bg-white p-8 shadow-2xl ring-1 ring-black/5 max-h-[calc(100vh-3rem)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-3xl font-bold text-emerald-950">{isEditing ? "Edit Habit" : "New Habit"}</h3>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-800"><X /></button>
        </div>

        <div className="space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-emerald-900/70">Habit name</span>
            <input className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-300" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Evening meditation" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-emerald-900/70">Emoji</span>
              <input className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-300" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-emerald-900/70">Type</span>
              <select className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-300" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, period: "day", frequency: 1 })}>
                <option value="build">Build habit</option>
                <option value="reduce">Reduce / quit habit</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-emerald-900/70">Frequency</span>
              <input type="number" min="0" className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-300" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: Number(e.target.value) })} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-emerald-900/70">Period</span>
              <select className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-300" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </label>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-zinc-700">Target preview: <span className="font-semibold">{targetLabel}</span></div>
          <label className="block">
            <span className="text-sm font-medium text-emerald-900/70">Notes</span>
            <textarea className="mt-2 min-h-[110px] w-full rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-300" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Why does this habit matter to you?" />
          </label>
        </div>

        <div className="mt-8 flex items-center justify-end gap-3">
          <button onClick={onClose} className="rounded-full border border-zinc-300 px-5 py-3 font-medium text-zinc-700">Cancel</button>
          <button
            onClick={() => {
              if (!form.name.trim()) return;
              onSave({
                id: initialHabit?.id ?? `${form.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
                name: form.name,
                emoji: form.emoji,
                type: form.type,
                target: { mode: form.type === "build" ? "daily" : "limit", frequency: form.frequency, period: form.period, label: targetLabel },
                logs: initialHabit
                  ? initialHabit.type === form.type
                    ? initialHabit.logs
                    : Array.from({ length: DAYS }, () => (form.type === "build" ? false : 0))
                  : Array.from({ length: DAYS }, () => (form.type === "build" ? false : 0)),
                notes: form.notes || "",
                color: form.type === "build" ? "emerald" : "amber",
              });
              onClose();
            }}
            className="rounded-full bg-emerald-500 px-6 py-3 font-semibold text-white hover:bg-emerald-600"
          >
            {isEditing ? "Save changes" : "Add habit"}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

function ReduceLogModal({ habit, onClose, onSave }) {
  const lastValue = Array.isArray(habit?.logs) ? habit.logs[habit.logs.length - 1] ?? 0 : 0;
  const [count, setCount] = useState(lastValue);
  if (!habit) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-2xl ring-1 ring-black/5">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-3xl font-bold text-emerald-950">Log count</h3>
            <p className="mt-1 text-emerald-900/60">{habit.name} · {habit.target.label}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-800"><X /></button>
        </div>
        <label className="mb-6 block">
          <span className="text-sm font-medium text-emerald-900/70">How many times this {habit.target.period}?</span>
          <input type="number" min="0" className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-2xl outline-none focus:ring-2 focus:ring-emerald-300" value={count} onChange={(e) => setCount(Math.max(0, Number(e.target.value)))} />
        </label>
        <div className="mb-8 grid grid-cols-5 gap-2">
          {[0, 1, 2, 3, 4].map((n) => (
            <button key={n} onClick={() => setCount(n)} className={`rounded-2xl border py-3 text-lg font-semibold ${count === n ? "border-emerald-500 bg-emerald-500 text-white" : "border-zinc-300 bg-white text-zinc-700"}`}>
              {n}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="rounded-full border border-zinc-300 px-5 py-3 font-medium text-zinc-700">Cancel</button>
          <button onClick={() => onSave(habit.id, count)} className="rounded-full bg-emerald-500 px-6 py-3 font-semibold text-white hover:bg-emerald-600">Save count</button>
        </div>
      </div>
    </div>
  );
}

function getTaskDate(task, field) {
  const value = task?.[field];
  if (!value) return null;
  return new Date(`${value}T00:00:00`);
}

function isTaskInPeriod(task, period = "week") {
  const createdAt = getTaskDate(task, "createdAt");
  if (!createdAt) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (period === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return createdAt >= start;
  }

  return createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear();
}

function getTaskMetrics(tasks, period = "week") {
  const scopedTasks = tasks.filter((task) => isTaskInPeriod(task, period));
  const completed = scopedTasks.filter((task) => task.done).length;
  const pending = scopedTasks.length - completed;
  const completionRate = scopedTasks.length ? Math.round((completed / scopedTasks.length) * 100) : 0;

  return {
    scopedTasks,
    completed,
    pending,
    completionRate,
  };
}

function getDashboardOverviewMetrics(habits, tasks, expenses) {
  const todayHabitCount = habits.filter((habit) => getHabitMetrics(habit).completedToday).length;
  const weekHabitCount = habits.reduce((sum, habit) => sum + getHabitMetrics(habit).periodSuccesses, 0);
  const todayExpense = expenses
    .filter((expense) => isDateToday(expense.date))
    .reduce((sum, expense) => sum + expense.amount, 0);
  const weeklyExpense = expenses
    .filter((expense) => isDateWithinLastDays(expense.date, 7))
    .reduce((sum, expense) => sum + expense.amount, 0);
  const weeklyTasks = getTaskMetrics(tasks, "week");
  const pendingTasks = tasks.filter((task) => !task.done);

  return {
    todayHabitCount,
    weekHabitCount,
    todayExpense,
    weeklyExpense,
    weeklyTaskRate: weeklyTasks.completionRate,
    weeklyTasksCompleted: weeklyTasks.completed,
    pendingTasksCount: pendingTasks.length,
    totalTasksCount: tasks.length,
  };
}

function normalizeJournalEntry(entry, index = 0) {
  const date = entry.date ?? getRelativeDateString(index);
  const body = entry.body ?? entry.preview ?? "";
  return {
    id: entry.id ?? `j-${Date.now()}-${index}`,
    title: entry.title?.trim() || "Untitled entry",
    body,
    preview: getJournalPreview(body),
    date,
    updatedAt: entry.updatedAt ?? `${date}T12:00:00`,
    folderId: entry.folderId ?? null,
  };
}

function normalizeJournalEntries(entries = []) {
  return entries.map(normalizeJournalEntry).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function normalizeJournalFolders(folders = []) {
  return folders
    .map((folder, index) => ({
      id: folder.id ?? `folder-${Date.now()}-${index}`,
      name: folder.name?.trim() || `Folder ${index + 1}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function TodoPanel({ tasks, setTasks, onBack }) {
  const [newTask, setNewTask] = useState("");
  const pendingTasks = tasks.filter((task) => !task.done);
  const completedTasks = tasks.filter((task) => task.done);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.10),transparent_25%),linear-gradient(135deg,#f7f8f3_0%,#eff3ee_45%,#f7eee2_100%)] px-6 py-8 md:px-10 lg:px-14">
      <div className="mx-auto max-w-5xl space-y-8">
        <SectionHeader title="Tasks" color="bg-sky-500" onBack={onBack} />
        <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Task focus</div>
              <div className="mt-2 text-3xl font-semibold text-zinc-950">{pendingTasks.length} still to do</div>
              <div className="mt-2 text-lg text-zinc-700">A quick visual split between what is left and what is already closed out.</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Completed</div>
              <div className="mt-2 text-3xl font-semibold text-zinc-950">{completedTasks.length}</div>
            </div>
          </div>
          <div className="mt-6 overflow-hidden rounded-full bg-zinc-100">
            <div className="flex h-4">
              <div
                className="bg-sky-500 transition-all"
                style={{ width: `${tasks.length ? (pendingTasks.length / tasks.length) * 100 : 0}%` }}
              />
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${tasks.length ? (completedTasks.length / tasks.length) * 100 : 0}%` }}
              />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-zinc-700">
            <span>Pending: {pendingTasks.length}</span>
            <span>Completed: {completedTasks.length}</span>
          </div>
        </div>
        <div className="flex gap-3 rounded-[2rem] bg-white/80 p-6 shadow-sm ring-1 ring-black/5">
          <input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a task" className="flex-1 rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-sky-300" />
          <button
            onClick={() => {
              if (!newTask.trim()) return;
              setTasks((current) => [...current, { id: `task-${Date.now()}`, text: newTask.trim(), done: false, createdAt: getTodayDateString(), completedAt: null }]);
              setNewTask("");
            }}
            className="rounded-2xl bg-sky-500 px-5 py-3 font-semibold text-white hover:bg-sky-600"
          >
            Add
          </button>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h3 className="text-2xl font-semibold text-zinc-950">Still to do</h3>
              <span className="rounded-full bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-700">{pendingTasks.length}</span>
            </div>
            <div className="space-y-4">
              {pendingTasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between gap-4 rounded-[1.5rem] border border-sky-100 bg-sky-50/70 p-5">
                  <button
                    className="flex flex-1 items-center gap-4 text-left"
                    onClick={() => setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, done: true, completedAt: getTodayDateString() } : t)))}
                  >
                    <div className="h-6 w-6 rounded-full border-2 border-sky-300 bg-white" />
                    <div>
                      <div className="text-xl font-semibold text-zinc-950">{task.text}</div>
                      <div className="mt-1 text-sm text-zinc-600">Created {formatExpenseDate(task.createdAt ?? getTodayDateString())}</div>
                    </div>
                  </button>
                  <button onClick={() => setTasks((current) => current.filter((t) => t.id !== task.id))} className="text-zinc-400 hover:text-red-500"><X /></button>
                </div>
              ))}
              {pendingTasks.length === 0 ? <div className="rounded-2xl bg-zinc-50 p-5 text-zinc-600">No open tasks right now.</div> : null}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h3 className="text-2xl font-semibold text-zinc-950">Completed</h3>
              <span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700">{completedTasks.length}</span>
            </div>
            <div className="space-y-4">
              {completedTasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between gap-4 rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-5">
                  <button
                    className="flex flex-1 items-center gap-4 text-left"
                    onClick={() => setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, done: false, completedAt: null } : t)))}
                  >
                    <div className="h-6 w-6 rounded-full border-2 border-emerald-500 bg-emerald-500" />
                    <div>
                      <div className="text-xl font-semibold text-zinc-600 line-through">{task.text}</div>
                      <div className="mt-1 text-sm text-zinc-600">Completed {formatExpenseDate(task.completedAt ?? getTodayDateString())}</div>
                    </div>
                  </button>
                  <button onClick={() => setTasks((current) => current.filter((t) => t.id !== task.id))} className="text-zinc-400 hover:text-red-500"><X /></button>
                </div>
              ))}
              {completedTasks.length === 0 ? <div className="rounded-2xl bg-zinc-50 p-5 text-zinc-600">No completed tasks yet.</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExpensePanel({ expenses, setExpenses, categories, setCategories, onBack }) {
  const [view, setView] = useState("month");
  const [form, setForm] = useState({ label: "", amount: "", category: categories[0] ?? "General", date: getTodayDateString() });
  const [newCategory, setNewCategory] = useState("");
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setHours(0, 0, 0, 0);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

  const visibleExpenses = useMemo(() => expenses.filter((expense) => {
    const expenseDate = new Date(`${expense.date ?? getTodayDateString()}T00:00:00`);
    if (view === "week") return expenseDate >= sevenDaysAgo;
    return expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear;
  }), [currentMonth, currentYear, expenses, sevenDaysAgo, view]);

  const total = visibleExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const largestExpense = Math.max(...visibleExpenses.map((e) => e.amount), 0);
  const categoryBreakdown = Object.entries(
    visibleExpenses.reduce((groups, expense) => {
      groups[expense.category] = (groups[expense.category] ?? 0) + expense.amount;
      return groups;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount], index) => ({
      category,
      amount,
      share: total > 0 ? Math.round((amount / total) * 100) : 0,
      fill: ["#39ff14", "#22d3ee", "#fb7185", "#f59e0b", "#a78bfa"][index % 5],
      glow: ["rgba(57,255,20,0.45)", "rgba(34,211,238,0.4)", "rgba(251,113,133,0.35)", "rgba(245,158,11,0.35)", "rgba(167,139,250,0.35)"][index % 5],
    }));

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.10),transparent_25%),linear-gradient(135deg,#f7f8f3_0%,#eff3ee_45%,#f7eee2_100%)] px-6 py-8 md:px-10 lg:px-14">
      <div className="mx-auto max-w-5xl space-y-8">
        <SectionHeader title="Expenses" color="bg-amber-500" onBack={onBack} />
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[1.8rem] border border-white/70 bg-white/95 p-4 shadow-sm ring-1 ring-black/5">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">View</div>
            <div className="mt-1 text-lg text-zinc-700">Switch between this week and this month.</div>
          </div>
          <div className="inline-flex rounded-full bg-zinc-100 p-1">
            {[
              { id: "week", label: "Weekly" },
              { id: "month", label: "Monthly" },
            ].map((option) => (
              <button
                key={option.id}
                onClick={() => setView(option.id)}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${view === option.id ? "bg-zinc-950 text-white" : "text-zinc-700 hover:bg-white"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <StatCard label={view === "week" ? "Weekly total" : "Monthly total"} value={total.toFixed(2)} suffix="$" />
          <StatCard label="Largest expense" value={largestExpense.toFixed(2)} suffix="$" />
        </div>
        <div className="grid gap-3 rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5 md:grid-cols-5">
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Expense" className="rounded-2xl border border-zinc-200 px-4 py-3" />
          <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" type="number" className="rounded-2xl border border-zinc-200 px-4 py-3" />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-2xl border border-zinc-200 px-4 py-3">
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <input value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} type="date" className="rounded-2xl border border-zinc-200 px-4 py-3" />
          <button
            onClick={() => {
              if (!form.label.trim() || !form.amount) return;
              setExpenses((current) => [...current, { id: `exp-${Date.now()}`, label: form.label.trim(), amount: Number(form.amount), category: form.category.trim() || "General", date: form.date || getTodayDateString() }]);
              setForm({ label: "", amount: "", category: categories[0] ?? "General", date: getTodayDateString() });
            }}
            className="rounded-2xl bg-amber-500 font-semibold text-white hover:bg-amber-600"
          >
            Add expense
          </button>
        </div>
        <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Categories</div>
              <div className="mt-2 text-2xl font-semibold text-zinc-950">Manage spending buckets</div>
            </div>
            <div className="flex flex-wrap gap-3">
              <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category" className="rounded-2xl border border-zinc-200 px-4 py-3" />
              <button
                onClick={() => {
                  const trimmed = newCategory.trim();
                  if (!trimmed || categories.includes(trimmed)) return;
                  setCategories((current) => [...current, trimmed]);
                  setForm((current) => ({ ...current, category: trimmed }));
                  setNewCategory("");
                }}
                className="rounded-2xl bg-zinc-950 px-5 py-3 font-semibold text-white hover:bg-zinc-800"
              >
                Add category
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {categories.map((category) => (
              <div key={category} className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-800">
                <span>{category}</span>
                <button
                  onClick={() => {
                    if (categories.length === 1) return;
                    setCategories((current) => current.filter((item) => item !== category));
                    setForm((current) => ({
                      ...current,
                      category: current.category === category ? categories.find((item) => item !== category) ?? "General" : current.category,
                    }));
                  }}
                  className="text-zinc-500 hover:text-red-600"
                  aria-label={`Delete ${category}`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            {visibleExpenses.map((exp) => (
              <div key={exp.id} className="flex items-center justify-between rounded-[1.5rem] border border-white/70 bg-white/95 p-5 shadow-sm ring-1 ring-black/5">
                <div>
                  <div className="text-xl font-semibold text-zinc-950">{exp.label}</div>
                  <div className="mt-1 text-base text-zinc-700">{exp.category} · {formatExpenseDate(exp.date ?? getTodayDateString())}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setExpenses((current) => current.filter((item) => item.id !== exp.id))}
                    className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Delete ${exp.label}`}
                  >
                    <Trash2 size={16} />
                  </button>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-zinc-950">{formatCurrency(exp.amount)}</div>
                  </div>
                </div>
              </div>
            ))}
            {visibleExpenses.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-zinc-300 bg-white/90 p-6 text-lg text-zinc-600">
                No expenses logged in this {view}.
              </div>
            ) : null}
          </div>
          <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
            <div className="mb-5">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Category breakdown</div>
              <div className="mt-2 text-2xl font-semibold text-zinc-950">Where the money is going</div>
            </div>
            <div className="space-y-4">
              {categoryBreakdown.map((item) => (
                <div key={item.category} className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-base font-semibold text-zinc-900">{item.category}</div>
                    <div className="text-sm text-zinc-700">{formatCurrency(item.amount)} · {item.share}%</div>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full border border-cyan-300/20 bg-slate-950/80">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(item.share, item.share > 0 ? 8 : 0)}%`,
                        background: `linear-gradient(90deg, ${item.fill} 0%, ${item.fill}dd 100%)`,
                        boxShadow: `0 0 14px ${item.glow}`,
                      }}
                    />
                  </div>
                </div>
              ))}
              {categoryBreakdown.length === 0 ? (
                <div className="rounded-2xl bg-zinc-50 p-4 text-zinc-600">Add expenses to see your category mix.</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function JournalPanel({ entries, setEntries, folders, setFolders, onBack }) {
  const [prompts] = useState(() => getRandomJournalPrompts());
  const [activeFolderId, setActiveFolderId] = useState("all");
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [selectedId, setSelectedId] = useState(entries[0]?.id ?? null);
  const [isEditingEntry, setIsEditingEntry] = useState(false);
  const [draft, setDraft] = useState(() => {
    const firstEntry = entries[0];
    return firstEntry
      ? { title: firstEntry.title, body: firstEntry.body, date: firstEntry.date, folderId: firstEntry.folderId ?? null }
      : { title: "", body: "", date: getTodayDateString(), folderId: null };
  });

  const visibleEntries = activeFolderId === "all"
    ? entries
    : activeFolderId === "unfiled"
      ? entries.filter((entry) => !entry.folderId)
      : entries.filter((entry) => entry.folderId === activeFolderId);

  useEffect(() => {
    if (!entries.length) {
      setSelectedId(null);
      setDraft({ title: "", body: "", date: getTodayDateString(), folderId: null });
      return;
    }

    const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? entries[0];
    setSelectedId(selectedEntry.id);
    setDraft({
      title: selectedEntry.title,
      body: selectedEntry.body,
      date: selectedEntry.date,
      folderId: selectedEntry.folderId ?? null,
    });
    setIsEditingEntry(false);
  }, [entries, selectedId]);

  const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? null;
  const bodyWordCount = draft.body.trim() ? draft.body.trim().split(/\s+/).length : 0;
  const folderNameById = Object.fromEntries(folders.map((folder) => [folder.id, folder.name]));

  const handleCreateEntry = (promptTitle = "New reflection") => {
    const timestamp = Date.now();
    const date = getTodayDateString();
    const newEntry = normalizeJournalEntry({
      id: `j-${timestamp}`,
      title: promptTitle,
      body: "",
      date,
      updatedAt: new Date(timestamp).toISOString(),
      folderId: activeFolderId === "all" || activeFolderId === "unfiled" ? null : activeFolderId,
    });
    setEntries((current) => [newEntry, ...current]);
    setSelectedId(newEntry.id);
    setIsEditingEntry(true);
  };

  const handleSaveEntry = () => {
    const trimmedTitle = draft.title.trim();
    const trimmedBody = draft.body.trim();
    if (!trimmedTitle || !trimmedBody) return;

    const nextEntry = normalizeJournalEntry({
      id: selectedEntry?.id ?? `j-${Date.now()}`,
      title: trimmedTitle,
      body: trimmedBody,
      date: draft.date || getTodayDateString(),
      updatedAt: new Date().toISOString(),
      folderId: draft.folderId || null,
    });

    setEntries((current) => {
      const exists = current.some((entry) => entry.id === nextEntry.id);
      if (!exists) return normalizeJournalEntries([nextEntry, ...current]);
      return normalizeJournalEntries(current.map((entry) => (entry.id === nextEntry.id ? nextEntry : entry)));
    });
    setSelectedId(nextEntry.id);
    setIsEditingEntry(false);
  };

  const handleDeleteEntry = (entryId) => {
    setEntries((current) => current.filter((entry) => entry.id !== entryId));
  };

  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const nextFolder = { id: `folder-${Date.now()}`, name: trimmed };
    setFolders((current) => normalizeJournalFolders([...current, nextFolder]));
    setNewFolderName("");
    setActiveFolderId(nextFolder.id);
  };

  const handleSaveFolderRename = () => {
    const trimmed = editingFolderName.trim();
    if (!editingFolderId || !trimmed) return;
    setFolders((current) => normalizeJournalFolders(current.map((folder) => (
      folder.id === editingFolderId ? { ...folder, name: trimmed } : folder
    ))));
    setEditingFolderId(null);
    setEditingFolderName("");
  };

  const handleDeleteFolder = (folderId) => {
    setFolders((current) => current.filter((folder) => folder.id !== folderId));
    setEntries((current) => normalizeJournalEntries(current.map((entry) => (
      entry.folderId === folderId ? { ...entry, folderId: null } : entry
    ))));
    if (activeFolderId === folderId) setActiveFolderId("all");
    if (draft.folderId === folderId) {
      setDraft((current) => ({ ...current, folderId: null }));
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.10),transparent_25%),linear-gradient(135deg,#f7f8f3_0%,#eff3ee_45%,#f7eee2_100%)] px-6 py-8 md:px-10 lg:px-14">
      <div className="mx-auto max-w-6xl space-y-8">
        <SectionHeader title="Journal" color="bg-emerald-500" onBack={onBack} />
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Prompt starters</div>
                  <div className="mt-2 text-2xl font-semibold text-zinc-950">Write from a useful question</div>
                </div>
                <button onClick={() => handleCreateEntry()} className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600">
                  New entry
                </button>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {prompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleCreateEntry(prompt)}
                    className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
              <div className="mb-5">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Folders</div>
                <div className="mt-2 text-2xl font-semibold text-zinc-950">Organize your entries</div>
              </div>
              <div className="flex gap-3">
                <input
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  placeholder="New folder name"
                  className="flex-1 rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-300"
                />
                <button onClick={handleCreateFolder} className="rounded-2xl bg-zinc-950 px-4 py-3 font-semibold text-white hover:bg-zinc-800">
                  Add
                </button>
              </div>
              <div className="mt-5 space-y-3">
                <button
                  onClick={() => setActiveFolderId("all")}
                  className={`flex w-full items-center justify-between rounded-[1.2rem] border px-4 py-3 text-left ${activeFolderId === "all" ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 bg-zinc-50"}`}
                >
                  <span className="font-semibold text-zinc-900">All entries</span>
                  <span className="text-sm text-zinc-500">{entries.length}</span>
                </button>
                <button
                  onClick={() => setActiveFolderId("unfiled")}
                  className={`flex w-full items-center justify-between rounded-[1.2rem] border px-4 py-3 text-left ${activeFolderId === "unfiled" ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 bg-zinc-50"}`}
                >
                  <span className="font-semibold text-zinc-900">Unfiled</span>
                  <span className="text-sm text-zinc-500">{entries.filter((entry) => !entry.folderId).length}</span>
                </button>
                {folders.map((folder) => (
                  <div key={folder.id} className={`rounded-[1.2rem] border px-4 py-3 ${activeFolderId === folder.id ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 bg-zinc-50"}`}>
                    {editingFolderId === folder.id ? (
                      <div className="flex gap-2">
                        <input
                          value={editingFolderName}
                          onChange={(event) => setEditingFolderName(event.target.value)}
                          className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-300"
                        />
                        <button onClick={handleSaveFolderRename} className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600">Save</button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <button onClick={() => setActiveFolderId(folder.id)} className="flex-1 text-left">
                          <div className="font-semibold text-zinc-900">{folder.name}</div>
                          <div className="text-sm text-zinc-500">{entries.filter((entry) => entry.folderId === folder.id).length} entries</div>
                        </button>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingFolderId(folder.id);
                              setEditingFolderName(folder.name);
                            }}
                            className="rounded-full p-2 text-zinc-400 hover:bg-white hover:text-zinc-700"
                            aria-label={`Rename ${folder.name}`}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => handleDeleteFolder(folder.id)}
                            className="rounded-full p-2 text-zinc-400 hover:bg-white hover:text-red-500"
                            aria-label={`Delete ${folder.name}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Entries</div>
                  <div className="mt-2 text-2xl font-semibold text-zinc-950">{visibleEntries.length} visible reflections</div>
                </div>
              </div>
              <div className="space-y-3">
                {visibleEntries.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => {
                      setSelectedId(entry.id);
                      setIsEditingEntry(false);
                    }}
                    className={`w-full rounded-[1.5rem] border p-5 text-left transition ${
                      entry.id === selectedId
                        ? "border-emerald-300 bg-emerald-50/80 shadow-sm"
                        : "border-zinc-200 bg-zinc-50 hover:border-emerald-200 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-lg font-semibold text-zinc-950">{entry.title}</div>
                        <div className="mt-1 text-sm text-zinc-500">{formatLongDate(entry.date)}</div>
                        <div className="mt-2 inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                          {entry.folderId ? folderNameById[entry.folderId] ?? "Folder" : "Unfiled"}
                        </div>
                      </div>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteEntry(entry.id);
                        }}
                        className="rounded-full p-2 text-zinc-400 transition hover:bg-white hover:text-red-500"
                        aria-label={`Delete ${entry.title}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="mt-3 text-sm leading-6 text-zinc-700">{entry.preview}</div>
                  </button>
                ))}
                {visibleEntries.length === 0 ? <div className="rounded-2xl bg-zinc-50 p-5 text-zinc-600">No entries in this view yet.</div> : null}
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-sm ring-1 ring-black/5">
            {selectedEntry && !isEditingEntry ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Entry</div>
                    <div className="mt-2 text-2xl font-semibold text-zinc-950">{selectedEntry.title}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <div className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700">{formatLongDate(selectedEntry.date)}</div>
                      <div className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700">
                        {selectedEntry.folderId ? folderNameById[selectedEntry.folderId] ?? "Folder" : "Unfiled"}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsEditingEntry(true)}
                    className="rounded-2xl bg-emerald-500 px-5 py-3 font-semibold text-white hover:bg-emerald-600"
                  >
                    Edit entry
                  </button>
                </div>
                <div className="mt-6 max-h-[36rem] overflow-y-auto rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-6">
                  <div className="whitespace-pre-wrap text-base leading-8 text-zinc-800">{selectedEntry.body}</div>
                </div>
                <div className="mt-4 text-sm text-zinc-500">Last updated {new Date(selectedEntry.updatedAt).toLocaleString()}</div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Editor</div>
                    <div className="mt-2 text-2xl font-semibold text-zinc-950">{selectedEntry ? "Refine the reflection" : "Start a new note"}</div>
                  </div>
                  <div className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700">{bodyWordCount} words</div>
                </div>

                <div className="mt-6 grid gap-4">
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Entry title"
                    className="rounded-2xl border border-zinc-200 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                  <input
                    value={draft.date}
                    onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
                    type="date"
                    className="rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                  <select
                    value={draft.folderId ?? ""}
                    onChange={(event) => setDraft((current) => ({ ...current, folderId: event.target.value || null }))}
                    className="rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-300"
                  >
                    <option value="">Unfiled</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>{folder.name}</option>
                    ))}
                  </select>
                  <textarea
                    value={draft.body}
                    onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                    placeholder="What reduced suffering today? What made the day more stable? What do you want to remember?"
                    className="min-h-[340px] rounded-[1.5rem] border border-zinc-200 px-4 py-4 text-base leading-7 outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-zinc-500">
                      {selectedEntry ? `Last updated ${new Date(selectedEntry.updatedAt).toLocaleString()}` : "Create an entry, then save when it feels honest enough."}
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          if (selectedEntry) {
                            setDraft({ title: selectedEntry.title, body: selectedEntry.body, date: selectedEntry.date, folderId: selectedEntry.folderId ?? null });
                            setIsEditingEntry(false);
                            return;
                          }
                          setDraft({ title: "", body: "", date: getTodayDateString(), folderId: null });
                        }}
                        className="rounded-2xl border border-zinc-200 px-4 py-3 font-semibold text-zinc-700 hover:bg-zinc-50"
                      >
                        {selectedEntry ? "Cancel" : "Reset"}
                      </button>
                      <button
                        onClick={handleSaveEntry}
                        className="rounded-2xl bg-emerald-500 px-5 py-3 font-semibold text-white hover:bg-emerald-600"
                      >
                        Save entry
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HabitPanel({ habits, setHabits, onBack }) {
  const [selectedHabit, setSelectedHabit] = useState(null);
  const [addingHabit, setAddingHabit] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const [loggingHabit, setLoggingHabit] = useState(null);
  const buildHabits = useMemo(() => habits.filter((h) => h.type === "build"), [habits]);
  const reduceHabits = useMemo(() => habits.filter((h) => h.type === "reduce"), [habits]);
  const todaysGoals = useMemo(() => habits.filter((h) => getHabitMetrics(h).completedToday).length, [habits]);
  const pendingHabits = useMemo(() => habits.filter((h) => !getHabitMetrics(h).completedToday), [habits]);

  const quickToggleBuildHabit = (habitId) => {
    setHabits((current) => current.map((habit) => {
      if (habit.id !== habitId || habit.type !== "build") return habit;
      const nextLogs = [...habit.logs];
      const todayIndex = getTodayLogIndex(nextLogs.length);
      nextLogs[todayIndex] = !nextLogs[todayIndex];
      const monthKey = getMonthKey();
      return {
        ...habit,
        logs: nextLogs,
        history: {
          ...getHabitHistory(habit),
          [monthKey]: nextLogs,
        },
      };
    }));
  };

  const saveReduceCount = (habitId, count) => {
    setHabits((current) => current.map((habit) => {
      if (habit.id !== habitId || habit.type !== "reduce") return habit;
      const nextLogs = [...habit.logs];
      const todayIndex = getTodayLogIndex(nextLogs.length);
      nextLogs[todayIndex] = count;
      const monthKey = getMonthKey();
      return {
        ...habit,
        logs: nextLogs,
        history: {
          ...getHabitHistory(habit),
          [monthKey]: nextLogs,
        },
      };
    }));
    setLoggingHabit(null);
  };

  const handleSaveHabit = (habit) => {
    setHabits((current) => {
      const exists = current.some((item) => item.id === habit.id);
      const monthKey = getMonthKey();
      const nextHabit = {
        ...habit,
        history: {
          ...getHabitHistory(habit),
          [monthKey]: habit.logs,
        },
      };
      if (!exists) return [...current, nextHabit];
      return current.map((item) => (item.id === habit.id ? { ...item, ...nextHabit } : item));
    });
    setEditingHabit(null);
  };

  const handleDeleteHabit = (habitId) => {
    setHabits((current) => current.filter((habit) => habit.id !== habitId));
    if (selectedHabit?.id === habitId) setSelectedHabit(null);
    if (editingHabit?.id === habitId) setEditingHabit(null);
    if (loggingHabit?.id === habitId) setLoggingHabit(null);
  };

  if (selectedHabit) {
    const freshHabit = habits.find((h) => h.id === selectedHabit.id) || selectedHabit;
    return (
      <>
        <DetailView habit={freshHabit} metrics={getHabitMetrics(freshHabit)} onBack={() => setSelectedHabit(null)} onQuickToggle={quickToggleBuildHabit} onOpenLogModal={setLoggingHabit} onEdit={setEditingHabit} onDelete={handleDeleteHabit} />
        {loggingHabit ? <ReduceLogModal habit={loggingHabit} onClose={() => setLoggingHabit(null)} onSave={saveReduceCount} /> : null}
        {editingHabit ? <AddHabitModal initialHabit={editingHabit} onClose={() => setEditingHabit(null)} onSave={handleSaveHabit} /> : null}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.14),transparent_22%),linear-gradient(135deg,#f7f8f3_0%,#eff3ee_45%,#f7eee2_100%)] px-6 py-8 md:px-10 lg:px-14">
      <div className="mx-auto max-w-[1500px]">
        <SectionHeader title="Habits" color="bg-emerald-600" onBack={onBack} />
        <div className="mb-10 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-4">
            <div className="rounded-[1.6rem] bg-white/80 px-6 py-4 text-xl text-emerald-900/70 shadow-sm ring-1 ring-black/5">Today&apos;s goals <span className="ml-2 font-bold text-emerald-950">{todaysGoals}/{habits.length}</span></div>
            {pendingHabits.length > 0 ? (
              <div className="max-w-4xl rounded-[1.6rem] bg-white/80 px-6 py-5 shadow-sm ring-1 ring-black/5">
                <div className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Pending today</div>
                <div className="mt-3 flex flex-wrap gap-3">
                  {pendingHabits.map((habit) => (
                    <button
                      key={habit.id}
                      onClick={() => setSelectedHabit(habit)}
                      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:border-emerald-300 hover:bg-emerald-50/70"
                    >
                      <span>{habit.emoji}</span>
                      <span>{habit.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <button onClick={() => setAddingHabit(true)} className="inline-flex items-center gap-2 rounded-[1.2rem] bg-emerald-600 px-5 py-3 text-lg font-semibold text-white shadow-md shadow-emerald-500/15 hover:bg-emerald-700"><Plus size={20} /> New Habit</button>
        </div>
        <div className="space-y-14">
          <section>
            <SectionHeader title="Build Habits" color="bg-emerald-600" />
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {buildHabits.map((habit) => (
                <HabitCard key={habit.id} habit={habit} metrics={getHabitMetrics(habit)} onSelect={setSelectedHabit} onQuickToggle={quickToggleBuildHabit} onOpenLogModal={setLoggingHabit} onEdit={setEditingHabit} onDelete={handleDeleteHabit} />
              ))}
            </div>
          </section>
          <section>
            <SectionHeader title="Reduce Limits" color="bg-amber-500" />
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {reduceHabits.map((habit) => (
                <HabitCard key={habit.id} habit={habit} metrics={getHabitMetrics(habit)} onSelect={setSelectedHabit} onQuickToggle={quickToggleBuildHabit} onOpenLogModal={setLoggingHabit} onEdit={setEditingHabit} onDelete={handleDeleteHabit} />
              ))}
            </div>
          </section>
        </div>
      </div>
      {addingHabit ? <AddHabitModal onClose={() => setAddingHabit(false)} onSave={handleSaveHabit} /> : null}
      {editingHabit ? <AddHabitModal initialHabit={editingHabit} onClose={() => setEditingHabit(null)} onSave={handleSaveHabit} /> : null}
      {loggingHabit ? <ReduceLogModal habit={loggingHabit} onClose={() => setLoggingHabit(null)} onSave={saveReduceCount} /> : null}
    </div>
  );
}

function DashboardHome({ habits, tasks, expenses, onOpenSection, workoutUrl, calendarUrl }) {
  const completedTasks = tasks.filter((task) => task.done).length;
  const pendingTasks = tasks.filter((task) => !task.done);
  const expenseTotal = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const overview = getDashboardOverviewMetrics(habits, tasks, expenses);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.14),transparent_22%),linear-gradient(135deg,#f7f8f3_0%,#eff3ee_45%,#f7eee2_100%)] px-6 py-8 md:px-10 lg:px-14">
      <div className="mx-auto max-w-[1500px] space-y-10">
        <div>
          <div>
            <div className="text-5xl">🍃</div>
            <h1 className="mt-2 text-5xl font-bold tracking-tight text-emerald-950 md:text-6xl">Personal Wellness Dashboard</h1>
            <p className="mt-3 max-w-3xl text-2xl text-emerald-900/60">A one-stop page for your habits, tasks, training, expenses, and reflection.</p>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/70 bg-white/95 p-8 shadow-sm ring-1 ring-black/5">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-700">Metrics overview</div>
              <div className="mt-2 text-3xl font-semibold text-zinc-950">Today</div>
            </div>
            <button onClick={() => onOpenSection("tasks")} className="rounded-full bg-zinc-950 px-5 py-2 font-semibold text-white hover:bg-zinc-800">
              Review tasks
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="homepage-inner-card rounded-[1.5rem] bg-zinc-50 p-5">
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Today</div>
              <div className="mt-3 text-3xl font-semibold text-zinc-950">{overview.todayHabitCount}/{habits.length}</div>
              <div className="mt-2 text-base text-zinc-700">Habits completed today</div>
            </div>
            <div className="homepage-inner-card rounded-[1.5rem] bg-zinc-50 p-5">
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Today</div>
              <div className="mt-3 text-3xl font-semibold text-zinc-950">{overview.pendingTasksCount}/{overview.totalTasksCount}</div>
              <div className="mt-2 text-base text-zinc-700">Tasks still pending</div>
            </div>
            <div className="homepage-inner-card rounded-[1.5rem] bg-zinc-50 p-5">
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Today</div>
              <div className="mt-3 text-3xl font-semibold text-zinc-950">{formatCurrency(overview.todayExpense)}</div>
              <div className="mt-2 text-base text-zinc-700">Spent today</div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <ModuleCard icon={Flame} title="Habit Tracking" subtitle="Open your streak dashboard, add habits, and log progress." rightText={`${habits.length} habits`} onClick={() => onOpenSection("habits")} />
          <ModuleCard icon={ListTodo} title="Tasks" subtitle="Keep today’s responsibilities visible and actionable." rightText={`${completedTasks}/${tasks.length} done`} accent="sky" onClick={() => onOpenSection("tasks")} />
          <ModuleCard icon={Dumbbell} title="Workout Sheet" subtitle="Open your workout plan in Google Sheets." rightText="External link" accent="amber" onClick={() => window.open(workoutUrl, "_blank", "noopener,noreferrer")} />
          <ModuleCard icon={Wallet} title="Expense Tracker" subtitle="Track this week or month and see category breakdowns at a glance." rightText={formatCurrency(expenseTotal)} accent="amber" onClick={() => onOpenSection("expenses")} />
          <ModuleCard icon={BookOpen} title="Journal" subtitle="Capture reflections, prompts, and what reduced suffering." rightText="Reflection" onClick={() => onOpenSection("journal")} />
          <ModuleCard icon={CalendarDays} title="Google Calendar" subtitle="Open Google Calendar in a new tab to check your schedule." rightText="Open gcal" accent="sky" onClick={() => window.open(calendarUrl, "_blank", "noopener,noreferrer")} />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="rounded-[2rem] bg-white/80 p-8 shadow-sm ring-1 ring-black/5 xl:col-span-2">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-3xl font-bold text-emerald-950">Habit snapshot</h2>
              <button onClick={() => onOpenSection("habits")} className="rounded-full bg-emerald-500 px-5 py-2 font-semibold text-white hover:bg-emerald-600">Open habits</button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {habits.slice(0, 4).map((habit) => {
                const metrics = getHabitMetrics(habit);
                return (
                  <div key={habit.id} className="homepage-inner-card rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-5">
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">{habit.emoji}</div>
                        <div>
                          <div className="max-w-[12rem] whitespace-nowrap font-semibold text-emerald-950" style={getHabitTitleStyle(habit.name)}>{habit.name}</div>
                          <div className="text-emerald-900/55">{formatStreakLabel(metrics.currentStreak, metrics.chartXAxisMode === "weeks" ? "week" : metrics.chartXAxisMode === "months" ? "month" : "day")}</div>
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-emerald-950">{metrics.consistency30}%</div>
                    </div>
                    <div className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">{getCurrentMonthLabel()}</div>
                    <LineChart data={metrics.chartData} xLabelMode={metrics.chartXAxisMode} color={palette[habit.color].stroke} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[2rem] bg-white/80 p-8 shadow-sm ring-1 ring-black/5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-3xl font-bold text-emerald-950">Tasks quick view</h2>
              <button onClick={() => onOpenSection("tasks")} className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600">
                Open tasks
              </button>
            </div>
            <div className="space-y-3">
              {pendingTasks.map((task) => (
                <div key={task.id} className="homepage-inner-card flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="h-4 w-4 rounded-full bg-zinc-300" />
                  <div className="text-lg text-zinc-950">{task.text}</div>
                </div>
              ))}
              {pendingTasks.length === 0 ? (
                <div className="homepage-inner-card rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-lg text-zinc-600">
                  No pending tasks right now.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StabilityDashboardApp() {
  const [habits, setHabits] = useState(() => {
    return loadStoredValue(HABITS_STORAGE_KEY, initialHabits.map(normalizeHabit), (stored) => stored.map(normalizeHabit));
  });
  const [tasks, setTasks] = useState(() => loadStoredValue(TASKS_STORAGE_KEY, initialTasks));
  const [expenses, setExpenses] = useState(() => loadStoredValue(EXPENSES_STORAGE_KEY, initialExpenses));
  const [expenseCategories, setExpenseCategories] = useState(() => loadStoredValue(EXPENSE_CATEGORIES_STORAGE_KEY, initialExpenseCategories));
  const [journalEntries, setJournalEntries] = useState(() =>
    loadStoredValue(JOURNAL_STORAGE_KEY, normalizeJournalEntries(initialJournalEntries), (stored) => normalizeJournalEntries(stored))
  );
  const [journalFolders, setJournalFolders] = useState(() =>
    loadStoredValue(JOURNAL_FOLDERS_STORAGE_KEY, normalizeJournalFolders(initialJournalFolders), (stored) => normalizeJournalFolders(stored))
  );
  const [activeSection, setActiveSection] = useState("dashboard");
  const workoutUrl = "https://docs.google.com/spreadsheets/";
  const calendarUrl = "https://calendar.google.com/";

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(HABITS_STORAGE_KEY, JSON.stringify(habits));
    }
  }, [habits]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
    }
  }, [tasks]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(expenses));
    }
  }, [expenses]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(EXPENSE_CATEGORIES_STORAGE_KEY, JSON.stringify(expenseCategories));
    }
  }, [expenseCategories]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(journalEntries));
    }
  }, [journalEntries]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(JOURNAL_FOLDERS_STORAGE_KEY, JSON.stringify(journalFolders));
    }
  }, [journalFolders]);

  if (activeSection === "habits") {
    return <HabitPanel habits={habits} setHabits={setHabits} onBack={() => setActiveSection("dashboard")} />;
  }
  if (activeSection === "tasks") {
    return <TodoPanel tasks={tasks} setTasks={setTasks} onBack={() => setActiveSection("dashboard")} />;
  }
  if (activeSection === "expenses") {
    return <ExpensePanel expenses={expenses} setExpenses={setExpenses} categories={expenseCategories} setCategories={setExpenseCategories} onBack={() => setActiveSection("dashboard")} />;
  }
  if (activeSection === "journal") {
    return <JournalPanel entries={journalEntries} setEntries={setJournalEntries} folders={journalFolders} setFolders={setJournalFolders} onBack={() => setActiveSection("dashboard")} />;
  }
  if (activeSection === "calendar") {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.10),transparent_25%),linear-gradient(135deg,#f7f8f3_0%,#eff3ee_45%,#f7eee2_100%)] px-6 py-8 md:px-10 lg:px-14">
        <div className="mx-auto max-w-5xl space-y-8">
          <SectionHeader title="Google Calendar" color="bg-sky-500" onBack={() => setActiveSection("dashboard")} />
          <div className="rounded-[2rem] border border-white/70 bg-white/95 p-8 shadow-sm ring-1 ring-black/5">
            <div className="text-2xl font-semibold text-zinc-950">Open Google Calendar</div>
            <div className="mt-3 text-lg text-zinc-700">Launch your calendar in a new tab to review your schedule, deadlines, and training blocks.</div>
            <button onClick={() => window.open(calendarUrl, "_blank", "noopener,noreferrer")} className="mt-6 rounded-full bg-sky-500 px-6 py-3 text-lg font-semibold text-white hover:bg-sky-600">
              Open gcal
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <DashboardHome habits={habits} tasks={tasks} expenses={expenses} onOpenSection={setActiveSection} workoutUrl={workoutUrl} calendarUrl={calendarUrl} />;
}
