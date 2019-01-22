import { Opt } from "../fields/Field";

export namespace DragManager {
    export let rootId = "root";
    let dragDiv: HTMLDivElement;

    export enum DragButtons {
        Left = 1, Right = 2, Both = Left | Right
    }

    interface DragOptions {
        handlers: DragHandlers;

        buttons: number;
    }

    export interface DragDisposer {
        (): void;
    }

    export class DragStartEvent {
        private _cancelled: boolean = false;
        get cancelled() { return this._cancelled };

        cancel() { this._cancelled = true; };
    }

    export class DragCompleteEvent {

    }

    export interface DragHandlers {
        dragStart: (e: DragStartEvent) => void;
        dragComplete: (e: DragCompleteEvent) => void;
    }

    export function MakeDraggable(element: HTMLElement, options: DragOptions): DragDisposer {
        if ("draggable" in element.dataset) {
            throw new Error("Element is already draggable, can't make it draggable again");
        }
        element.dataset["draggable"] = "true";
        const dispose = () => {
            document.removeEventListener("pointerup", upHandler);
            document.removeEventListener("pointermove", startDragHandler);
        }
        const startDragHandler = (e: PointerEvent) => {
            e.stopPropagation();
            e.preventDefault();
            dispose();
            StartDrag(element, e, options);
        }
        const upHandler = (e: PointerEvent) => {
            dispose();
        };
        const downHandler = (e: PointerEvent) => {
            document.addEventListener("pointermove", startDragHandler);
            document.addEventListener("pointerup", upHandler);
        };
        element.addEventListener("pointerdown", downHandler);

        return () => {
            element.removeEventListener("pointerdown", downHandler);
            element.dataset["draggable"] = undefined;
        }
    }

    function StartDrag(ele: HTMLElement, e: PointerEvent, options: DragOptions) {
        if (!dragDiv) {
            const root = document.getElementById(rootId);
            if (!root) {
                throw new Error("No root element found");
            }
            dragDiv = document.createElement("div");
            root.appendChild(dragDiv);
        }
        if ((e.buttons & options.buttons) === 0) {
            return;
        }
        let event = new DragStartEvent();
        options.handlers.dragStart(event);
        if (event.cancelled) {
            return;
        }
        let x = e.x, y = e.y;
        let dragElement = ele.cloneNode(true) as HTMLElement;
        dragElement.style.position = "absolute";
        dragElement.style.transform = `translate(${x}px, ${y}px)`;
        dragDiv.appendChild(dragElement);

        const moveHandler = (e: PointerEvent) => {
            e.stopPropagation();
            e.preventDefault();
            x += e.movementX;
            y += e.movementY;
            dragElement.style.transform = `translate(${x}px, ${y}px)`;
        };
        const upHandler = (e: PointerEvent) => {
            document.removeEventListener("pointermove", moveHandler, true);
            document.removeEventListener("pointerup", upHandler);
            FinishDrag(dragElement, options);
        };
        document.addEventListener("pointermove", moveHandler, true);
        document.addEventListener("pointerup", upHandler);
    }

    function FinishDrag(ele: HTMLElement, options: DragOptions) {
        dragDiv.removeChild(ele);
    }
}