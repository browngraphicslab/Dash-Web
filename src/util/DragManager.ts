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

    export interface DragDropDisposer {
        (): void;
    }

    export class DragStartEvent {
        private _cancelled: boolean = false;
        get cancelled() { return this._cancelled };

        cancel() { this._cancelled = true; };

        constructor(readonly x:number, readonly y:number, readonly data: { [id: string]: any }) { }
    }

    export class DragCompleteEvent {

    }

    export interface DragHandlers {
        dragStart: (e: DragStartEvent) => void;
        dragComplete: (e: DragCompleteEvent) => void;
    }

    export interface DropOptions {
        handlers: DropHandlers;
    }

    export class DropEvent {
        constructor(readonly x: number, readonly y: number, readonly data: { [id: string]: any }) { }
    }

    export interface DropHandlers {
        drop: (e: DropEvent) => void;
    }

    export function MakeDraggable(element: HTMLElement, options: DragOptions): DragDropDisposer {
        if ("draggable" in element.dataset) {
            throw new Error("Element is already draggable, can't make it draggable again");
        }
        element.dataset["draggable"] = "true";
        const dispose = () => {
            document.removeEventListener("pointerup", upHandler);
            document.removeEventListener("pointermove", startDragHandler);
        }
        const startDragHandler = (e: PointerEvent) => {
            e.stopImmediatePropagation();
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
            delete element.dataset["draggable"];
        }
    }

    export function MakeDropTarget(element: HTMLElement, options: DropOptions): DragDropDisposer {
        if ("draggable" in element.dataset) {
            throw new Error("Element is already droppable, can't make it droppable again");
        }
        element.dataset["canDrop"] = "true";
        const handler = (e: Event) => {
            const ce = e as CustomEvent<DropEvent>;
            options.handlers.drop(ce.detail);
        };
        element.addEventListener("dashOnDrop", handler);
        return () => {
            element.removeEventListener("dashOnDrop", handler);
            delete element.dataset["canDrop"]
        };
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
        e.stopPropagation();
        e.preventDefault();
        let dragData = {};
        let event = new DragStartEvent(e.x, e.y, dragData);
        options.handlers.dragStart(event);
        if (event.cancelled) {
            return;
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

        const moveHandler = (e: PointerEvent) => {
            e.stopPropagation();
            e.preventDefault();
            x += e.movementX;
            y += e.movementY;
            dragElement.style.transform = `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`;
        };
        const upHandler = (e: PointerEvent) => {
            document.removeEventListener("pointermove", moveHandler, true);
            document.removeEventListener("pointerup", upHandler);
            FinishDrag(dragElement, e, options, dragData);
        };
        document.addEventListener("pointermove", moveHandler, true);
        document.addEventListener("pointerup", upHandler);
    }

    function FinishDrag(ele: HTMLElement, e: PointerEvent, options: DragOptions, dragData: { [index: string]: any }) {
        dragDiv.removeChild(ele);
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
    }
}