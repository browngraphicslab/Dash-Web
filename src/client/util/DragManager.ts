import { action } from "mobx";
import { Document } from "../../fields/Document";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import { CollectionView } from "../views/collections/CollectionView";
import { DocumentDecorations } from "../views/DocumentDecorations";
import { DocumentView } from "../views/nodes/DocumentView";
import { returnFalse, emptyFunction } from "../../Utils";
import { Main } from "../views/Main";
import globalStyles from '../views/_global_variables.scss';

export function setupDrag(_reference: React.RefObject<HTMLDivElement>, docFunc: () => Document, moveFunc?: DragManager.MoveFunction, copyOnDrop: boolean = false) {
    let onRowMove = action((e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();

        document.removeEventListener("pointermove", onRowMove);
        document.removeEventListener('pointerup', onRowUp);
        var dragData = new DragManager.DocumentDragData([docFunc()]);
        dragData.copyOnDrop = copyOnDrop;
        dragData.moveDocument = moveFunc;
        DragManager.StartDocumentDrag([_reference.current!], dragData, e.x, e.y);
    });
    let onRowUp = action((e: PointerEvent): void => {
        document.removeEventListener("pointermove", onRowMove);
        document.removeEventListener('pointerup', onRowUp);
    });
    let onItemDown = (e: React.PointerEvent) => {
        // if (this.props.isSelected() || this.props.isTopMost) {
        if (e.button === 0) {
            e.stopPropagation();
            if (e.shiftKey) {
                CollectionDockingView.Instance.StartOtherDrag([docFunc()], e);
            } else {
                document.addEventListener("pointermove", onRowMove);
                document.addEventListener("pointerup", onRowUp);
            }
        }
        //}
    };
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
        Left = 1,
        Right = 2,
        Both = Left | Right
    }

    interface DragOptions {
        handlers: DragHandlers;

        hideSource: boolean | (() => boolean);
    }

    export interface DragDropDisposer {
        (): void;
    }

    export class DragCompleteEvent { }

    export interface DragHandlers {
        dragComplete: (e: DragCompleteEvent) => void;
    }

    export interface DropOptions {
        handlers: DropHandlers;
    }
    export class DropEvent {
        constructor(
            readonly x: number,
            readonly y: number,
            readonly data: { [id: string]: any }
        ) { }
    }

    export interface DropHandlers {
        drop: (e: Event, de: DropEvent) => void;
    }

    export function MakeDropTarget(
        element: HTMLElement,
        options: DropOptions
    ): DragDropDisposer {
        if ("canDrop" in element.dataset) {
            throw new Error(
                "Element is already droppable, can't make it droppable again"
            );
        }
        element.dataset.canDrop = "true";
        const handler = (e: Event) => {
            const ce = e as CustomEvent<DropEvent>;
            options.handlers.drop(e, ce.detail);
        };
        element.addEventListener("dashOnDrop", handler);
        return () => {
            element.removeEventListener("dashOnDrop", handler);
            delete element.dataset.canDrop;
        };
    }

    export type MoveFunction = (document: Document, targetCollection: Document, addDocument: (document: Document) => boolean) => boolean;
    export class DocumentDragData {
        constructor(dragDoc: Document[]) {
            this.draggedDocuments = dragDoc;
            this.droppedDocuments = dragDoc;
        }
        draggedDocuments: Document[];
        droppedDocuments: Document[];
        xOffset?: number;
        yOffset?: number;
        aliasOnDrop?: boolean;
        copyOnDrop?: boolean;
        moveDocument?: MoveFunction;
        [id: string]: any;
    }

    export function StartDocumentDrag(eles: HTMLElement[], dragData: DocumentDragData, downX: number, downY: number, options?: DragOptions) {
        StartDrag(eles, dragData, downX, downY, options,
            (dropData: { [id: string]: any }) => (dropData.droppedDocuments = dragData.aliasOnDrop ? dragData.draggedDocuments.map(d => d.CreateAlias()) : dragData.copyOnDrop ? dragData.draggedDocuments.map(d => d.Copy(true) as Document) : dragData.draggedDocuments));
    }

    export class LinkDragData {
        constructor(linkSourceDoc: DocumentView) {
            this.linkSourceDocumentView = linkSourceDoc;
        }
        droppedDocuments: Document[] = [];
        linkSourceDocumentView: DocumentView;
        [id: string]: any;
    }

    export function StartLinkDrag(ele: HTMLElement, dragData: LinkDragData, downX: number, downY: number, options?: DragOptions) {
        StartDrag([ele], dragData, downX, downY, options);
    }

    function StartDrag(eles: HTMLElement[], dragData: { [id: string]: any }, downX: number, downY: number, options?: DragOptions, finishDrag?: (dropData: { [id: string]: any }) => void) {
        if (!dragDiv) {
            dragDiv = document.createElement("div");
            dragDiv.className = "dragManager-dragDiv";
            DragManager.Root().appendChild(dragDiv);
        }
        Main.Instance.SetTextDoc(undefined, undefined, undefined);

        let scaleXs: number[] = [];
        let scaleYs: number[] = [];
        let xs: number[] = [];
        let ys: number[] = [];

        const docs: Document[] =
            dragData instanceof DocumentDragData ? dragData.draggedDocuments : [];
        let dragElements = eles.map(ele => {
            const w = ele.offsetWidth,
                h = ele.offsetHeight;
            const rect = ele.getBoundingClientRect();
            const scaleX = rect.width / w,
                scaleY = rect.height / h;
            let x = rect.left,
                y = rect.top;
            xs.push(x);
            ys.push(y);
            scaleXs.push(scaleX);
            scaleYs.push(scaleY);
            let dragElement = ele.cloneNode(true) as HTMLElement;
            dragElement.style.opacity = "0.7";
            dragElement.style.position = "absolute";
            dragElement.style.margin = "0";
            dragElement.style.top = "0";
            dragElement.style.bottom = "";
            dragElement.style.left = "0";
            dragElement.style.transformOrigin = "0 0";
            dragElement.style.zIndex = "1000";// globalStyles.contextMenuZindex.toString();
            dragElement.style.transform = `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`;
            dragElement.style.width = `${rect.width / scaleX}px`;
            dragElement.style.height = `${rect.height / scaleY}px`;

            // bcz: if PDFs are rendered with svg's, then this code isn't needed
            // bcz: PDFs don't show up if you clone them when rendered using a canvas. 
            //      however, PDF's have a thumbnail field that contains an image of their canvas.
            //      So we replace the pdf's canvas with the image thumbnail
            // if (docs.length) {
            //     var pdfBox = dragElement.getElementsByClassName("pdfBox-cont")[0] as HTMLElement;
            //     let thumbnail = docs[0].GetT(KeyStore.Thumbnail, ImageField);
            //     if (pdfBox && pdfBox.childElementCount && thumbnail) {
            //         let img = new Image();
            //         img.src = thumbnail.toString();
            //         img.style.position = "absolute";
            //         img.style.width = `${rect.width / scaleX}px`;
            //         img.style.height = `${rect.height / scaleY}px`;
            //         pdfBox.replaceChild(img, pdfBox.children[0])
            //     }
            // }

            dragDiv.appendChild(dragElement);
            return dragElement;
        });

        let hideSource = false;
        if (options) {
            if (typeof options.hideSource === "boolean") {
                hideSource = options.hideSource;
            } else {
                hideSource = options.hideSource();
            }
        }
        eles.map(ele => (ele.hidden = hideSource));

        let lastX = downX;
        let lastY = downY;
        const moveHandler = (e: PointerEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (dragData instanceof DocumentDragData) {
                dragData.aliasOnDrop = e.ctrlKey || e.altKey;
            }
            if (e.shiftKey) {
                abortDrag();
                CollectionDockingView.Instance.StartOtherDrag(docs, {
                    pageX: e.pageX,
                    pageY: e.pageY,
                    preventDefault: emptyFunction,
                    button: 0
                });
            }
            //TODO: Why can't we use e.movementX and e.movementY?
            let moveX = e.pageX - lastX;
            let moveY = e.pageY - lastY;
            lastX = e.pageX;
            lastY = e.pageY;
            dragElements.map((dragElement, i) => (dragElement.style.transform =
                `translate(${(xs[i] += moveX)}px, ${(ys[i] += moveY)}px) 
                scale(${scaleXs[i]}, ${scaleYs[i]})`)
            );
        };

        const abortDrag = () => {
            document.removeEventListener("pointermove", moveHandler, true);
            document.removeEventListener("pointerup", upHandler);
            dragElements.map(dragElement => dragDiv.removeChild(dragElement));
            eles.map(ele => (ele.hidden = false));
        };
        const upHandler = (e: PointerEvent) => {
            abortDrag();
            FinishDrag(eles, e, dragData, options, finishDrag);
        };
        document.addEventListener("pointermove", moveHandler, true);
        document.addEventListener("pointerup", upHandler);
    }

    function FinishDrag(dragEles: HTMLElement[], e: PointerEvent, dragData: { [index: string]: any }, options?: DragOptions, finishDrag?: (dragData: { [index: string]: any }) => void) {
        let removed = dragEles.map(dragEle => {
            let parent = dragEle.parentElement;
            if (parent) parent.removeChild(dragEle);
            return [dragEle, parent];
        });
        const target = document.elementFromPoint(e.x, e.y);
        removed.map(r => {
            let dragEle = r[0];
            let parent = r[1];
            if (parent && dragEle) parent.appendChild(dragEle);
        });
        if (target) {
            if (finishDrag) finishDrag(dragData);

            target.dispatchEvent(
                new CustomEvent<DropEvent>("dashOnDrop", {
                    bubbles: true,
                    detail: {
                        x: e.x,
                        y: e.y,
                        data: dragData
                    }
                })
            );

            if (options) {
                options.handlers.dragComplete({});
            }
        }
        DocumentDecorations.Instance.Hidden = false;
    }
}
