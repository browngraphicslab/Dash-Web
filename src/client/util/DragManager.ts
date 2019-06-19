import { action, runInAction, observable } from "mobx";
import { Doc, DocListCastAsync } from "../../new_fields/Doc";
import { Cast } from "../../new_fields/Types";
import { emptyFunction } from "../../Utils";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import * as globalCssVariables from "../views/globalCssVariables.scss";
import { URLField } from "../../new_fields/URLField";
import { SelectionManager } from "./SelectionManager";

export type dropActionType = "alias" | "copy" | undefined;
export function SetupDrag(_reference: React.RefObject<HTMLElement>, docFunc: () => Doc | Promise<Doc>, moveFunc?: DragManager.MoveFunction, dropAction?: dropActionType, options?: any, dontHideOnDrop?: boolean) {
    let onRowMove = async (e: PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();

        document.removeEventListener("pointermove", onRowMove);
        document.removeEventListener('pointerup', onRowUp);
        var dragData = new DragManager.DocumentDragData([await docFunc()]);
        dragData.dropAction = dropAction;
        dragData.moveDocument = moveFunc;
        dragData.options = options;
        dragData.dontHideOnDrop = dontHideOnDrop;
        DragManager.StartDocumentDrag([_reference.current!], dragData, e.x, e.y);
    };
    let onRowUp = (): void => {
        document.removeEventListener("pointermove", onRowMove);
        document.removeEventListener('pointerup', onRowUp);
    };
    let onItemDown = async (e: React.PointerEvent) => {
        // if (this.props.isSelected() || this.props.isTopMost) {
        if (e.button === 0) {
            e.stopPropagation();
            if (e.shiftKey && CollectionDockingView.Instance) {
                CollectionDockingView.Instance.StartOtherDrag([await docFunc()], e);
            } else {
                document.addEventListener("pointermove", onRowMove);
                document.addEventListener("pointerup", onRowUp);
            }
        }
        //}
    };
    return onItemDown;
}

export async function DragLinksAsDocuments(dragEle: HTMLElement, x: number, y: number, sourceDoc: Doc) {
    let srcTarg = sourceDoc.proto;
    let draggedDocs: Doc[] = [];
    let draggedFromDocs: Doc[] = [];
    if (srcTarg) {
        let linkToDocs = await DocListCastAsync(srcTarg.linkedToDocs);
        let linkFromDocs = await DocListCastAsync(srcTarg.linkedFromDocs);
        if (linkToDocs) draggedDocs = linkToDocs.map(linkDoc => Cast(linkDoc.linkedTo, Doc) as Doc);
        if (linkFromDocs) draggedFromDocs = linkFromDocs.map(linkDoc => Cast(linkDoc.linkedFrom, Doc) as Doc);
    }
    draggedDocs.push(...draggedFromDocs);
    if (draggedDocs.length) {
        let moddrag: Doc[] = [];
        for (const draggedDoc of draggedDocs) {
            let doc = await Cast(draggedDoc.annotationOn, Doc);
            if (doc) moddrag.push(doc);
        }
        let dragData = new DragManager.DocumentDragData(moddrag.length ? moddrag : draggedDocs);
        DragManager.StartDocumentDrag([dragEle], dragData, x, y, {
            handlers: {
                dragComplete: action(emptyFunction),
            },
            hideSource: false
        });
    }
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
            readonly data: { [id: string]: any },
            readonly mods: string
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

    export type MoveFunction = (document: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean) => boolean;
    export class DocumentDragData {
        constructor(dragDoc: Doc[]) {
            this.draggedDocuments = dragDoc;
            this.droppedDocuments = dragDoc;
            this.xOffset = 0;
            this.yOffset = 0;
        }
        draggedDocuments: Doc[];
        droppedDocuments: Doc[];
        xOffset: number;
        yOffset: number;
        dropAction: dropActionType;
        userDropAction: dropActionType;
        moveDocument?: MoveFunction;
        [id: string]: any;
    }

    export class AnnotationDragData {
        constructor(dragDoc: Doc, annotationDoc: Doc, dropDoc: Doc) {
            this.dragDocument = dragDoc;
            this.dropDocument = dropDoc;
            this.annotationDocument = annotationDoc;
            this.xOffset = this.yOffset = 0;
        }
        dragDocument: Doc;
        annotationDocument: Doc;
        dropDocument: Doc;
        xOffset: number;
        yOffset: number;
        dropAction: dropActionType;
        userDropAction: dropActionType;
    }

    export let StartDragFunctions: (() => void)[] = [];

    export function StartDocumentDrag(eles: HTMLElement[], dragData: DocumentDragData, downX: number, downY: number, options?: DragOptions) {
        runInAction(() => StartDragFunctions.map(func => func()));
        StartDrag(eles, dragData, downX, downY, options,
            (dropData: { [id: string]: any }) =>
                (dropData.droppedDocuments = dragData.userDropAction === "alias" || (!dragData.userDropAction && dragData.dropAction === "alias") ?
                    dragData.draggedDocuments.map(d => Doc.MakeAlias(d)) :
                    dragData.userDropAction === "copy" || (!dragData.userDropAction && dragData.dropAction === "copy") ?
                        dragData.draggedDocuments.map(d => Doc.MakeCopy(d, true)) :
                        dragData.draggedDocuments));
    }

    export function StartAnnotationDrag(eles: HTMLElement[], dragData: AnnotationDragData, downX: number, downY: number, options?: DragOptions) {
        StartDrag(eles, dragData, downX, downY, options);
    }

    export class LinkDragData {
        constructor(linkSourceDoc: Doc, blacklist: Doc[] = []) {
            this.linkSourceDocument = linkSourceDoc;
            this.blacklist = blacklist;
        }
        droppedDocuments: Doc[] = [];
        linkSourceDocument: Doc;
        blacklist: Doc[];
        dontClearTextBox?: boolean;
        [id: string]: any;
    }

    export class EmbedDragData {
        constructor(embeddableSourceDoc: Doc) {
            this.embeddableSourceDoc = embeddableSourceDoc;
            this.urlField = embeddableSourceDoc.data instanceof URLField ? embeddableSourceDoc.data : undefined;
        }
        embeddableSourceDoc: Doc;
        urlField?: URLField;
        [id: string]: any;
    }

    export function StartLinkDrag(ele: HTMLElement, dragData: LinkDragData, downX: number, downY: number, options?: DragOptions) {
        StartDrag([ele], dragData, downX, downY, options);
    }

    export function StartEmbedDrag(ele: HTMLElement, dragData: EmbedDragData, downX: number, downY: number, options?: DragOptions) {
        StartDrag([ele], dragData, downX, downY, options);
    }

    export let AbortDrag: () => void = emptyFunction;

    function StartDrag(eles: HTMLElement[], dragData: { [id: string]: any }, downX: number, downY: number, options?: DragOptions, finishDrag?: (dropData: { [id: string]: any }) => void) {
        eles = eles.filter(e => e);
        if (!dragDiv) {
            dragDiv = document.createElement("div");
            dragDiv.className = "dragManager-dragDiv";
            dragDiv.style.pointerEvents = "none";
            DragManager.Root().appendChild(dragDiv);
        }
        SelectionManager.SetIsDragging(true);
        let scaleXs: number[] = [];
        let scaleYs: number[] = [];
        let xs: number[] = [];
        let ys: number[] = [];

        const docs: Doc[] =
            dragData instanceof DocumentDragData ? dragData.draggedDocuments : dragData instanceof AnnotationDragData ? [dragData.dragDocument] : [];
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
            dragElement.style.color = "black";
            dragElement.style.transformOrigin = "0 0";
            dragElement.style.zIndex = globalCssVariables.contextMenuZindex;// "1000";
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
            let set = dragElement.getElementsByTagName('*');
            if (dragElement.hasAttribute("style")) (dragElement as any).style.pointerEvents = "none";
            // tslint:disable-next-line: prefer-for-of
            for (let i = 0; i < set.length; i++) {
                if (set[i].hasAttribute("style")) {
                    let s = set[i];
                    (s as any).style.pointerEvents = "none";
                }
            }


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
            e.preventDefault(); // required or dragging text menu link item ends up dragging the link button as native drag/drop
            if (dragData instanceof DocumentDragData) {
                dragData.userDropAction = e.ctrlKey || e.altKey ? "alias" : undefined;
            }
            if (e.shiftKey && CollectionDockingView.Instance) {
                AbortDrag();
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
                `translate(${(xs[i] += moveX)}px, ${(ys[i] += moveY)}px)  scale(${scaleXs[i]}, ${scaleYs[i]})`)
            );
        };

        let hideDragElements = () => {
            SelectionManager.SetIsDragging(false);
            dragElements.map(dragElement => dragElement.parentNode === dragDiv && dragDiv.removeChild(dragElement));
            eles.map(ele => (ele.hidden = false));
        };
        let endDrag = () => {
            document.removeEventListener("pointermove", moveHandler, true);
            document.removeEventListener("pointerup", upHandler);
            if (options) {
                options.handlers.dragComplete({});
            }
        };

        AbortDrag = () => {
            hideDragElements();
            endDrag();
        };
        const upHandler = (e: PointerEvent) => {
            hideDragElements();
            dispatchDrag(eles, e, dragData, options, finishDrag);
            endDrag();
        };
        document.addEventListener("pointermove", moveHandler, true);
        document.addEventListener("pointerup", upHandler);
    }

    function dispatchDrag(dragEles: HTMLElement[], e: PointerEvent, dragData: { [index: string]: any }, options?: DragOptions, finishDrag?: (dragData: { [index: string]: any }) => void) {
        let removed = dragData.dontHideOnDrop ? [] : dragEles.map(dragEle => {
            // let parent = dragEle.parentElement;
            // if (parent) parent.removeChild(dragEle);
            let ret = [dragEle, dragEle.style.width, dragEle.style.height];
            dragEle.style.width = "0";
            dragEle.style.height = "0";
            return ret;
        });
        const target = document.elementFromPoint(e.x, e.y);
        removed.map(r => {
            let dragEle = r[0] as HTMLElement;
            dragEle.style.width = r[1] as string;
            dragEle.style.height = r[2] as string;
            // let parent = r[1];
            // if (parent && dragEle) parent.appendChild(dragEle);
        });
        if (target) {
            if (finishDrag) finishDrag(dragData);

            target.dispatchEvent(
                new CustomEvent<DropEvent>("dashOnDrop", {
                    bubbles: true,
                    detail: {
                        x: e.x,
                        y: e.y,
                        data: dragData,
                        mods: e.altKey ? "AltKey" : ""
                    }
                })
            );
        }
    }
}
