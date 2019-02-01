import { Opt } from "../fields/Field";
import { DocumentView } from "../views/nodes/DocumentView";
import { DocumentDecorations } from "../DocumentDecorations";
import { SelectionManager } from "./SelectionManager";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import { Document } from "../fields/Document";

export namespace DragManager {
    export function Root() {
        const root = document.getElementById("root");
        if (!root) {
            throw new Error("No root element found");
        }
        return root;
    }

    let dragDiv: HTMLDivElement;

    export enum DragButtons {
        Left = 1, Right = 2, Both = Left | Right
    }

    interface DragOptions {
        handlers: DragHandlers;

        hideSource: boolean | (() => boolean);
    }

    export interface DragDropDisposer {
        (): void;
    }

    export class DragCompleteEvent {
    }

    export interface DragHandlers {
        dragComplete: (e: DragCompleteEvent) => void;
    }

    export interface DropOptions {
        handlers: DropHandlers;
    }

    export class DropEvent {
        constructor(readonly x: number, readonly y: number, readonly data: { [id: string]: any }) { }
    }

    export interface DropHandlers {
        drop: (e: Event, de: DropEvent) => void;
    }

    export function MakeDropTarget(element: HTMLElement, options: DropOptions): DragDropDisposer {
        if ("canDrop" in element.dataset) {
            throw new Error("Element is already droppable, can't make it droppable again");
        }
        element.dataset["canDrop"] = "true";
        const handler = (e: Event) => {
            const ce = e as CustomEvent<DropEvent>;
            options.handlers.drop(e, ce.detail);
        };
        element.addEventListener("dashOnDrop", handler);
        return () => {
            element.removeEventListener("dashOnDrop", handler);
            delete element.dataset["canDrop"]
        };
    }


    let _lastPointerX: number = 0;
    let _lastPointerY: number = 0;
    export function StartDrag(ele: HTMLElement, dragData: { [id: string]: any }, options: DragOptions) {
        if (!dragDiv) {
            dragDiv = document.createElement("div");
            DragManager.Root().appendChild(dragDiv);
        }
        const w = ele.offsetWidth, h = ele.offsetHeight;
        const rect = ele.getBoundingClientRect();
        const scaleX = rect.width / w, scaleY = rect.height / h;
        let x = rect.left, y = rect.top;
        // const offsetX = e.x - rect.left, offsetY = e.y - rect.top;
        let dragElement = ele.cloneNode(true) as HTMLElement;
        dragElement.style.opacity = "0.7";
        dragElement.style.position = "absolute";
        dragElement.style.transformOrigin = "0 0";
        dragElement.style.transform = `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`;
        dragDiv.appendChild(dragElement);
        _lastPointerX = dragData["xOffset"] + rect.left;
        _lastPointerY = dragData["yOffset"] + rect.top;

        let hideSource = false;
        if (typeof options.hideSource === "boolean") {
            hideSource = options.hideSource;
        } else {
            hideSource = options.hideSource();
        }
        const wasHidden = ele.hidden;
        if (hideSource) {
            ele.hidden = true;
        }

        const moveHandler = (e: PointerEvent) => {
            e.stopPropagation();
            e.preventDefault();
            x += e.clientX - _lastPointerX; _lastPointerX = e.clientX;
            y += e.clientY - _lastPointerY; _lastPointerY = e.clientY;
            dragElement.style.transform = `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`;
        };
        const upHandler = (e: PointerEvent) => {
            document.removeEventListener("pointermove", moveHandler, true);
            document.removeEventListener("pointerup", upHandler);
            FinishDrag(dragElement, e, options, dragData);
            if (hideSource && !wasHidden) {
                ele.hidden = false;
            }
        };
        document.addEventListener("pointermove", moveHandler, true);
        document.addEventListener("pointerup", upHandler);
    }

    function FinishDrag(dragEle: HTMLElement, e: PointerEvent, options: DragOptions, dragData: { [index: string]: any }) {
        dragDiv.removeChild(dragEle);
        const target = document.elementFromPoint(e.x, e.y);
        if (!target) {
            return;
        }
        target.dispatchEvent(new CustomEvent<DropEvent>("dashOnDrop", {
            bubbles: true,
            detail: {
                x: e.x,
                y: e.y,
                data: dragData
            }
        }));
        options.handlers.dragComplete({});
    }
}