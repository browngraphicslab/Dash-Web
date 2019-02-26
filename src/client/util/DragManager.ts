import { DocumentDecorations } from "../views/DocumentDecorations";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import { Document } from "../../fields/Document"
import { action } from "mobx";
import { DocumentView } from "../views/nodes/DocumentView";

export function setupDrag(_reference: React.RefObject<HTMLDivElement>, docFunc: () => Document) {
    let onRowMove = action((e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();

        document.removeEventListener("pointermove", onRowMove);
        document.removeEventListener('pointerup', onRowUp);
        DragManager.StartDrag(_reference.current!, { document: docFunc() });
    });
    let onRowUp = action((e: PointerEvent): void => {
        document.removeEventListener("pointermove", onRowMove);
        document.removeEventListener('pointerup', onRowUp);
    });
    let onItemDown = (e: React.PointerEvent) => {
        // if (this.props.isSelected() || this.props.isTopMost) {
        if (e.button == 0) {
            e.stopPropagation();
            if (e.shiftKey) {
                CollectionDockingView.Instance.StartOtherDrag(docFunc(), e);
            } else {
                document.addEventListener("pointermove", onRowMove);
                document.addEventListener('pointerup', onRowUp);
            }
        }
        //}
    }
    return onItemDown;
}

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

    export function StartDrag(ele: HTMLElement, dragData: { [id: string]: any }, options?: DragOptions) {
        DocumentDecorations.Instance.Hidden = true;
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
        dragElement.style.bottom = "";
        dragElement.style.left = "";
        dragElement.style.transformOrigin = "0 0";
        dragElement.style.zIndex = "1000";
        dragElement.style.transform = `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`;
        dragElement.style.width = `${rect.width / scaleX}px`;
        dragElement.style.height = `${rect.height / scaleY}px`;
        // It seems like the above code should be able to just be this:
        // dragElement.style.transform = `translate(${x}px, ${y}px)`;
        // dragElement.style.width = `${rect.width}px`;
        // dragElement.style.height = `${rect.height}px`;
        dragDiv.appendChild(dragElement);

        let hideSource = false;
        if (options) {
            if (typeof options.hideSource === "boolean") {
                hideSource = options.hideSource;
            } else {
                hideSource = options.hideSource();
            }
        }
        const wasHidden = ele.hidden;
        if (hideSource) {
            ele.hidden = true;
        }

        const moveHandler = (e: PointerEvent) => {
            e.stopPropagation();
            e.preventDefault();
            x += e.movementX;
            y += e.movementY;
            if (e.shiftKey) {
                abortDrag();
                const docView: DocumentView = dragData["documentView"];
                const doc: Document = docView ? docView.props.Document : dragData["document"];
                CollectionDockingView.Instance.StartOtherDrag(doc, { pageX: e.pageX, pageY: e.pageY, preventDefault: () => { }, button: 0 });
            }
            dragElement.style.transform = `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`;
        };

        const abortDrag = () => {
            document.removeEventListener("pointermove", moveHandler, true);
            document.removeEventListener("pointerup", upHandler);
            dragDiv.removeChild(dragElement);
            if (hideSource && !wasHidden) {
                ele.hidden = false;
            }
        }
        const upHandler = (e: PointerEvent) => {
            abortDrag();
            FinishDrag(dragElement, e, dragData, options);
        };
        document.addEventListener("pointermove", moveHandler, true);
        document.addEventListener("pointerup", upHandler);
    }

    function FinishDrag(dragEle: HTMLElement, e: PointerEvent, dragData: { [index: string]: any }, options?: DragOptions) {
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
        if (options) {
            options.handlers.dragComplete({});
        }
        DocumentDecorations.Instance.Hidden = false;
    }
}