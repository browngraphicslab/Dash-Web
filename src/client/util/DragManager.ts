import { DocumentDecorations } from "../views/DocumentDecorations";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import { Document } from "../../fields/Document"
import { action } from "mobx";
import { ImageField } from "../../fields/ImageField";
import { KeyStore } from "../../fields/KeyStore";
import { CollectionView } from "../views/collections/CollectionView";

export function setupDrag(_reference: React.RefObject<HTMLDivElement>, docFunc: () => Document, removeFunc: (containingCollection: CollectionView) => void = () => { }) {
    let onRowMove = action((e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();

        document.removeEventListener("pointermove", onRowMove);
        document.removeEventListener('pointerup', onRowUp);
        DragManager.StartDrag(_reference.current!, { draggedDocument: docFunc(), removeDocument: removeFunc });
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
        if (!dragDiv) {
            dragDiv = document.createElement("div");
            dragDiv.className = "dragManager-dragDiv"
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

        // bcz: PDFs don't show up if you clone them because they contain a canvas.
        //      however, PDF's have a thumbnail field that contains an image of their canvas.
        //      So we replace the pdf's canvas with the image thumbnail
        const doc: Document = dragData["draggedDocument"];
        if (doc) {
            var pdfBox = dragElement.getElementsByClassName("pdfBox-cont")[0] as HTMLElement;
            let thumbnail = doc.GetT(KeyStore.Thumbnail, ImageField);
            if (pdfBox && pdfBox.childElementCount && thumbnail) {
                let img = new Image();
                img!.src = thumbnail.toString();
                img!.style.position = "absolute";
                img!.style.width = `${rect.width / scaleX}px`;
                img!.style.height = `${rect.height / scaleY}px`;
                pdfBox.replaceChild(img!, pdfBox.children[0])
            }
        }

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
            FinishDrag(ele, e, dragData, options);
        };
        document.addEventListener("pointermove", moveHandler, true);
        document.addEventListener("pointerup", upHandler);
    }

    function FinishDrag(dragEle: HTMLElement, e: PointerEvent, dragData: { [index: string]: any }, options?: DragOptions) {
        let parent = dragEle.parentElement;
        if (parent)
            parent.removeChild(dragEle);
        const target = document.elementFromPoint(e.x, e.y);
        if (parent)
            parent.appendChild(dragEle);
        if (!target) {
            return;
        }
        dragData["droppedDocument"] = dragData["aliasOnDrop"] ? (dragData["draggedDocument"] as Document).CreateAlias() : dragData["draggedDocument"];
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