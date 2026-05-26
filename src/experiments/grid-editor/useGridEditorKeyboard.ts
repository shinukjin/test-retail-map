"use client";

import { useEffect } from "react";
import type { GridEditorModel } from "./useGridEditorModel";

function isEditingField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function useGridEditorKeyboard(model: GridEditorModel) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditingField(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) model.redo();
        else model.undo();
        return;
      }
      if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        model.redo();
        return;
      }

      if (mod && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        model.selectAllAnchors();
        return;
      }

      if (mod && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        model.duplicateSelection();
        return;
      }

      if (mod) {
        if (e.key === "c" || e.key === "C") {
          e.preventDefault();
          model.copySelection();
          return;
        }
        if (e.key === "x" || e.key === "X") {
          e.preventDefault();
          model.cutSelection();
          return;
        }
        if (e.key === "v" || e.key === "V") {
          e.preventDefault();
          model.pasteSelection();
          return;
        }
      }

      if (e.key === "Escape") {
        model.selectCell(null);
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        model.clearSelectionContent();
        return;
      }

      if (e.shiftKey && !mod && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const dir =
          e.key === "ArrowUp"
            ? "up"
            : e.key === "ArrowDown"
              ? "down"
              : e.key === "ArrowLeft"
                ? "left"
                : "right";
        model.growSelection(dir);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [model]);
}
