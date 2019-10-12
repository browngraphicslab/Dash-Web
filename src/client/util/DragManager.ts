import { action, runInAction } from "mobx";
import { Doc, Field } from "../../new_fields/Doc";
import { Cast, StrCast } from "../../new_fields/Types";
import { URLField } from "../../new_fields/URLField";
import { emptyFunction } from "../../Utils";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import * as globalCssVariables from "../views/globalCssVariables.scss";
import { DocumentManager } from "./DocumentManager";
import { LinkManager } from "./LinkManager";
import { SelectionManager } from "./SelectionManager";
import { SchemaHeaderField } from "../../new_fields/SchemaHeaderField";
import { Docs } from "../documents/Documents";
import { ScriptField } from "../../new_fields/ScriptField";
import { List } from "../../new_fields/List";
import { PrefetchProxy } from "../../new_fields/Proxy";

export type dropActionType = "alias" | "copy" | undefined;
export function SetupDrag(
    _reference: React.RefObject<HTMLElement>,
    docFunc: () => Doc | Promise<Doc>,
    moveFunc?: DragManager.MoveFunction,
    dropAction?: dropActionType,
    options?: any,
    dontHideOnDrop?: boolean,
    dragStarted?: () => void
) {
    let onRowMove = async (e: PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();

        document.removeEventListener("pointermove", onRowMove);
        document.removeEventListener('pointerup', onRowUp);
        let doc = await docFunc();
        var dragData = new DragManager.DocumentDragData([doc]);
        dragData.dropAction = dropAction;
        dragData.moveDocument = moveFunc;
        dragData.options = options;
        dragData.dontHideOnDrop = dontHideOnDrop;
        DragManager.StartDocumentDrag([_reference.current!], dragData, e.x, e.y);
        dragStarted && dragStarted();
    };
    let onRowUp = (): void => {
        document.removeEventListener("pointermove", onRowMove);
        document.removeEventListener('pointerup', onRowUp);
    };
    let onItemDown = async (e: React.PointerEvent) => {
        if (e.button === 0) {
            e.stopPropagation();
            if (e.shiftKey && CollectionDockingView.Instance) {
                e.persist();
                CollectionDockingView.Instance.StartOtherDrag({
                    pageX: e.pageX,
                    pageY: e.pageY,
                    preventDefault: emptyFunction,
                    button: 0
                }, [await docFunc()]);
            } else {
                document.addEventListener("pointermove", onRowMove);
                document.addEventListener("pointerup", onRowUp);
            }
        }
    };
    return onItemDown;
}

function moveLinkedDocument(doc: Doc, targetCollection: Doc, addDocument: (doc: Doc) => boolean): boolean {
    const document = SelectionManager.SelectedDocuments()[0];
    document && document.props.removeDocument && document.props.removeDocument(doc);
    addDocument(doc);
    return true;
}

export async function DragLinkAsDocument(dragEle: HTMLElement, x: number, y: number, linkDoc: Doc, sourceDoc: Doc) {
    let draggeddoc = LinkManager.Instance.getOppositeAnchor(linkDoc, sourceDoc);
    if (draggeddoc) {
        let moddrag = await Cast(draggeddoc.annotationOn, Doc);
        let dragdocs = moddrag ? [moddrag] : [draggeddoc];
        let dragData = new DragManager.DocumentDragData(dragdocs);
        dragData.moveDocument = moveLinkedDocument;
        DragManager.StartLinkedDocumentDrag([dragEle], dragData, x, y, {
            handlers: {
                dragComplete: action(emptyFunction),
            },
            hideSource: false
        });
    }
}

export async function DragLinksAsDocuments(dragEle: HTMLElement, x: number, y: number, sourceDoc: Doc) {
    let srcTarg = sourceDoc.proto;
    let draggedDocs: Doc[] = [];

    if (srcTarg) {
        let linkDocs = LinkManager.Instance.getAllRelatedLinks(srcTarg);
        if (linkDocs) {
            draggedDocs = linkDocs.map(link => {
                let opp = LinkManager.Instance.getOppositeAnchor(link, sourceDoc);
                if (opp) return opp;
            }) as Doc[];
        }
    }
    if (draggedDocs.length) {
        let moddrag: Doc[] = [];
        for (const draggedDoc of draggedDocs) {
            let doc = await Cast(draggedDoc.annotationOn, Doc);
            if (doc) moddrag.push(doc);
        }
        let dragdocs = moddrag.length ? moddrag : draggedDocs;
        let dragData = new DragManager.DocumentDragData(dragdocs);
        dragData.moveDocument = moveLinkedDocument;
        DragManager.StartLinkedDocumentDrag([dragEle], dragData, x, y, {
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

        dragHasStarted?: () => void;

        withoutShiftDrag?: boolean;

        finishDrag?: (dropData: { [id: string]: any }) => void;

        offsetX?: number;

        offsetY?: number;
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
            this.offset = [0, 0];
        }
        draggedDocuments: Doc[];
        droppedDocuments: Doc[];
        removeDropProperties: string[] = [];
        offset: number[];
        dropAction: dropActionType;
        userDropAction: dropActionType;
        moveDocument?: MoveFunction;
        applyAsTemplate?: boolean;
        [id: string]: any;
    }

    export class AnnotationDragData {
        constructor(dragDoc: Doc, annotationDoc: Doc, dropDoc: Doc) {
            this.dragDocument = dragDoc;
            this.dropDocument = dropDoc;
            this.annotationDocument = annotationDoc;
            this.offset = [0, 0];
        }
        targetContext: Doc | undefined;
        dragDocument: Doc;
        annotationDocument: Doc;
        dropDocument: Doc;
        offset: number[];
        dropAction: dropActionType;
        userDropAction: dropActionType;
    }

    export let StartDragFunctions: (() => void)[] = [];

    export function StartDocumentDrag(eles: HTMLElement[], dragData: DocumentDragData, downX: number, downY: number, options?: DragOptions) {
        runInAction(() => StartDragFunctions.map(func => func()));
        StartDrag(eles, dragData, downX, downY, options, options && options.finishDrag ? options.finishDrag :
            (dropData: { [id: string]: any }) => {
                (dropData.droppedDocuments = dragData.userDropAction === "alias" || (!dragData.userDropAction && dragData.dropAction === "alias") ?
                    dragData.draggedDocuments.map(d => Doc.MakeAlias(d)) :
                    dragData.userDropAction === "copy" || (!dragData.userDropAction && dragData.dropAction === "copy") ?
                        dragData.draggedDocuments.map(d => Doc.MakeCopy(d, true)) :
                        dragData.draggedDocuments
                );
                dragData.removeDropProperties.map(prop => dropData.droppedDocuments.map((d: Doc) => d[prop] = undefined));
            });
    }

    export function StartButtonDrag(eles: HTMLElement[], script: string, title: string, vars: { [name: string]: Field }, params: string[], initialize: (button: Doc) => void, downX: number, downY: number, options?: DragOptions) {
        let dragData = new DragManager.DocumentDragData([]);
        runInAction(() => StartDragFunctions.map(func => func()));
        StartDrag(eles, dragData, downX, downY, options, options && options.finishDrag ? options.finishDrag :
            (dropData: { [id: string]: any }) => {
                let bd = Docs.Create.ButtonDocument({ width: 150, height: 50, title: title });
                bd.onClick = ScriptField.MakeScript(script);
                params.map(p => Object.keys(vars).indexOf(p) !== -1 && (Doc.GetProto(bd)[p] = new PrefetchProxy(vars[p] as Doc)));
                initialize && initialize(bd);
                bd.buttonParams = new List<string>(params);
                dropData.droppedDocuments = [bd];
            });
    }

    export function StartLinkedDocumentDrag(eles: HTMLElement[], dragData: DocumentDragData, downX: number, downY: number, options?: DragOptions) {
        dragData.moveDocument = moveLinkedDocument;

        runInAction(() => StartDragFunctions.map(func => func()));
        StartDrag(eles, dragData, downX, downY, options,
            (dropData: { [id: string]: any }) => {
                let droppedDocuments: Doc[] = dragData.draggedDocuments.reduce((droppedDocs: Doc[], d) => {
                    let dvs = DocumentManager.Instance.getDocumentViews(d);
                    if (dvs.length) {
                        let containingView = SelectionManager.SelectedDocuments()[0] ? SelectionManager.SelectedDocuments()[0].props.ContainingCollectionView : undefined;
                        let inContext = dvs.filter(dv => dv.props.ContainingCollectionView === containingView);
                        if (inContext.length) {
                            inContext.forEach(dv => droppedDocs.push(dv.props.Document));
                        } else {
                            droppedDocs.push(Doc.MakeAlias(d));
                        }
                    } else {
                        droppedDocs.push(Doc.MakeAlias(d));
                    }
                    return droppedDocs;
                }, []);
                dropData.droppedDocuments = droppedDocuments;
            });
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

    // for column dragging in schema view
    export class ColumnDragData {
        constructor(colKey: SchemaHeaderField) {
            this.colKey = colKey;
        }
        colKey: SchemaHeaderField;
        [id: string]: any;
    }

    export function StartLinkDrag(ele: HTMLElement, dragData: LinkDragData, downX: number, downY: number, options?: DragOptions) {
        StartDrag([ele], dragData, downX, downY, options);
    }

    export function StartEmbedDrag(ele: HTMLElement, dragData: EmbedDragData, downX: number, downY: number, options?: DragOptions) {
        StartDrag([ele], dragData, downX, downY, options);
    }

    export function StartColumnDrag(ele: HTMLElement, dragData: ColumnDragData, downX: number, downY: number, options?: DragOptions) {
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

        const docs = dragData instanceof DocumentDragData ? dragData.draggedDocuments :
            dragData instanceof AnnotationDragData ? [dragData.dragDocument] : [];
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
            dragElement.style.borderRadius = getComputedStyle(ele).borderRadius;
            dragElement.style.position = "absolute";
            dragElement.style.margin = "0";
            dragElement.style.top = "0";
            dragElement.style.bottom = "";
            dragElement.style.left = "0";
            dragElement.style.transition = "none";
            dragElement.style.color = "black";
            dragElement.style.transformOrigin = "0 0";
            dragElement.style.zIndex = globalCssVariables.contextMenuZindex;// "1000";
            dragElement.style.transform = `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`;
            dragElement.style.width = `${rect.width / scaleX}px`;
            dragElement.style.height = `${rect.height / scaleY}px`;

            if (docs.length) {
                var pdfBox = dragElement.getElementsByTagName("canvas");
                var pdfBoxSrc = ele.getElementsByTagName("canvas");
                Array.from(pdfBox).map((pb, i) => pb.getContext('2d')!.drawImage(pdfBoxSrc[i], 0, 0));
                var pdfView = dragElement.getElementsByClassName("pdfViewer-viewer");
                var pdfViewSrc = ele.getElementsByClassName("pdfViewer-viewer");
                let tops = Array.from(pdfViewSrc).map(p => p.scrollTop);
                let oldopacity = dragElement.style.opacity;
                dragElement.style.opacity = "0";
                setTimeout(() => {
                    dragElement.style.opacity = oldopacity;
                    Array.from(pdfView).map((v, i) => v.scrollTo({ top: tops[i] }));
                }, 0);
            }
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

        eles.map(ele => ele.hidden = hideSource);

        let lastX = downX;
        let lastY = downY;
        const moveHandler = (e: PointerEvent) => {
            e.preventDefault(); // required or dragging text menu link item ends up dragging the link button as native drag/drop
            if (dragData instanceof DocumentDragData) {
                dragData.userDropAction = e.ctrlKey || e.altKey ? "alias" : undefined;
            }
            if (((options && !options.withoutShiftDrag) || !options) && e.shiftKey && CollectionDockingView.Instance) {
                AbortDrag();
                CollectionDockingView.Instance.StartOtherDrag({
                    pageX: e.pageX,
                    pageY: e.pageY,
                    preventDefault: emptyFunction,
                    button: 0
                }, docs);
            }
            //TODO: Why can't we use e.movementX and e.movementY?
            let moveX = e.pageX - lastX;
            let moveY = e.pageY - lastY;
            lastX = e.pageX;
            lastY = e.pageY;
            dragElements.map((dragElement, i) => (dragElement.style.transform =
                `translate(${(xs[i] += moveX) + (options ? (options.offsetX || 0) : 0)}px, ${(ys[i] += moveY) + (options ? (options.offsetY || 0) : 0)}px)  scale(${scaleXs[i]}, ${scaleYs[i]})`)
            );
        };

        let hideDragShowOriginalElements = () => {
            dragElements.map(dragElement => dragElement.parentNode === dragDiv && dragDiv.removeChild(dragElement));
            eles.map(ele => ele.hidden = false);
        };
        let endDrag = () => {
            document.removeEventListener("pointermove", moveHandler, true);
            document.removeEventListener("pointerup", upHandler);
            if (options) {
                options.handlers.dragComplete({});
            }
        };

        AbortDrag = () => {
            hideDragShowOriginalElements();
            SelectionManager.SetIsDragging(false);
            endDrag();
        };
        const upHandler = (e: PointerEvent) => {
            hideDragShowOriginalElements();
            dispatchDrag(eles, e, dragData, options, finishDrag);
            SelectionManager.SetIsDragging(false);
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
            finishDrag && finishDrag(dragData);

            target.dispatchEvent(
                new CustomEvent<DropEvent>("dashOnDrop", {
                    bubbles: true,
                    detail: {
                        x: e.x,
                        y: e.y,
                        data: dragData,
                        mods: e.altKey ? "AltKey" : e.ctrlKey ? "CtrlKey" : e.metaKey ? "MetaKey" : ""
                    }
                })
            );
        }
    }
}
