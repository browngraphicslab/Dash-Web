import { action, runInAction } from "mobx";
import { Doc, Field } from "../../new_fields/Doc";
import { Cast, ScriptCast } from "../../new_fields/Types";
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
import { listSpec } from "../../new_fields/Schema";
import { Scripting } from "./Scripting";
import { convertDropDataToButtons } from "./DropConverter";

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
    const onRowMove = async (e: PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();

        document.removeEventListener("pointermove", onRowMove);
        document.removeEventListener('pointerup', onRowUp);
        const doc = await docFunc();
        const dragData = new DragManager.DocumentDragData([doc]);
        dragData.dropAction = dropAction;
        dragData.moveDocument = moveFunc;
        dragData.options = options;
        dragData.dontHideOnDrop = dontHideOnDrop;
        DragManager.StartDocumentDrag([_reference.current!], dragData, e.x, e.y);
        dragStarted && dragStarted();
    };
    const onRowUp = (): void => {
        document.removeEventListener("pointermove", onRowMove);
        document.removeEventListener('pointerup', onRowUp);
    };
    const onItemDown = async (e: React.PointerEvent) => {
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
    const draggeddoc = LinkManager.Instance.getOppositeAnchor(linkDoc, sourceDoc);
    if (draggeddoc) {
        const moddrag = await Cast(draggeddoc.annotationOn, Doc);
        const dragdocs = moddrag ? [moddrag] : [draggeddoc];
        const dragData = new DragManager.DocumentDragData(dragdocs);
        dragData.moveDocument = moveLinkedDocument;
        DragManager.StartLinkedDocumentDrag([dragEle], dragData, x, y, {
            handlers: {
                dragComplete: action(emptyFunction),
            },
            hideSource: false
        });
    }
}

export async function DragLinksAsDocuments(dragEle: HTMLElement, x: number, y: number, sourceDoc: Doc, singleLink?: Doc) {
    const srcTarg = sourceDoc.proto;
    let draggedDocs: Doc[] = [];

    if (srcTarg) {
        const linkDocs = singleLink ? [singleLink] : LinkManager.Instance.getAllRelatedLinks(srcTarg);
        if (linkDocs) {
            draggedDocs = linkDocs.map(link => {
                const opp = LinkManager.Instance.getOppositeAnchor(link, sourceDoc);
                if (opp) return opp;
            }) as Doc[];
        }
    }
    if (draggedDocs.length) {
        const moddrag: Doc[] = [];
        for (const draggedDoc of draggedDocs) {
            const doc = await Cast(draggedDoc.annotationOn, Doc);
            if (doc) moddrag.push(doc);
        }
        const dragdocs = moddrag.length ? moddrag : draggedDocs;
        const dragData = new DragManager.DocumentDragData(dragdocs);
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
        dragDivName?: string;
        offset: number[];
        dropAction: dropActionType;
        userDropAction: dropActionType;
        embedDoc?: boolean;
        moveDocument?: MoveFunction;
        isSelectionMove?: boolean; // indicates that an explicitly selected Document is being dragged.  this will suppress onDragStart scripts
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
        dragData.draggedDocuments.map(d => d.dragFactory); // does this help?  trying to make sure the dragFactory Doc is loaded
        StartDrag(eles, dragData, downX, downY, options, options && options.finishDrag ? options.finishDrag :
            (dropData: { [id: string]: any }) => {
                (dropData.droppedDocuments =
                    dragData.draggedDocuments.map(d => !dragData.isSelectionMove && !dragData.userDropAction && ScriptCast(d.onDragStart) ? ScriptCast(d.onDragStart).script.run({ this: d }).result :
                        dragData.userDropAction === "alias" || (!dragData.userDropAction && dragData.dropAction === "alias") ? Doc.MakeAlias(d) :
                            dragData.userDropAction === "copy" || (!dragData.userDropAction && dragData.dropAction === "copy") ? Doc.MakeCopy(d, true) : d)
                );
                dropData.droppedDocuments.forEach((drop: Doc, i: number) =>
                    Cast(dragData.draggedDocuments[i].removeDropProperties, listSpec("string"), []).map(prop => drop[prop] = undefined));
            });
    }

    export function StartButtonDrag(eles: HTMLElement[], script: string, title: string, vars: { [name: string]: Field }, params: string[], initialize: (button: Doc) => void, downX: number, downY: number, options?: DragOptions) {
        const dragData = new DragManager.DocumentDragData([]);
        runInAction(() => StartDragFunctions.map(func => func()));
        StartDrag(eles, dragData, downX, downY, options, options && options.finishDrag ? options.finishDrag :
            (dropData: { [id: string]: any }) => {
                const bd = Docs.Create.ButtonDocument({ width: 150, height: 50, title: title });
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
                const droppedDocuments: Doc[] = dragData.draggedDocuments.reduce((droppedDocs: Doc[], d) => {
                    const dvs = DocumentManager.Instance.getDocumentViews(d);
                    if (dvs.length) {
                        const containingView = SelectionManager.SelectedDocuments()[0] ? SelectionManager.SelectedDocuments()[0].props.ContainingCollectionView : undefined;
                        const inContext = dvs.filter(dv => dv.props.ContainingCollectionView === containingView);
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
        const scaleXs: number[] = [];
        const scaleYs: number[] = [];
        const xs: number[] = [];
        const ys: number[] = [];

        const docs = dragData instanceof DocumentDragData ? dragData.draggedDocuments :
            dragData instanceof AnnotationDragData ? [dragData.dragDocument] : [];
        const dragElements = eles.map(ele => {
            const w = ele.offsetWidth,
                h = ele.offsetHeight;
            const rect = ele.getBoundingClientRect();
            const scaleX = rect.width / w,
                scaleY = rect.height / h;
            const x = rect.left,
                y = rect.top;
            xs.push(x);
            ys.push(y);
            scaleXs.push(scaleX);
            scaleYs.push(scaleY);
            const dragElement = ele.cloneNode(true) as HTMLElement;
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
            dragElement.style.transform = `translate(${x + (options?.offsetX || 0)}px, ${y + (options?.offsetY || 0)}px) scale(${scaleX}, ${scaleY})`;
            dragElement.style.width = `${rect.width / scaleX}px`;
            dragElement.style.height = `${rect.height / scaleY}px`;

            if (docs.length) {
                const pdfBox = dragElement.getElementsByTagName("canvas");
                const pdfBoxSrc = ele.getElementsByTagName("canvas");
                Array.from(pdfBox).map((pb, i) => pb.getContext('2d')!.drawImage(pdfBoxSrc[i], 0, 0));
                const pdfView = dragElement.getElementsByClassName("pdfViewer-viewer");
                const pdfViewSrc = ele.getElementsByClassName("pdfViewer-viewer");
                const tops = Array.from(pdfViewSrc).map(p => p.scrollTop);
                const oldopacity = dragElement.style.opacity;
                dragElement.style.opacity = "0";
                setTimeout(() => {
                    dragElement.style.opacity = oldopacity;
                    Array.from(pdfView).map((v, i) => v.scrollTo({ top: tops[i] }));
                }, 0);
            }
            const set = dragElement.getElementsByTagName('*');
            if (dragElement.hasAttribute("style")) (dragElement as any).style.pointerEvents = "none";
            // tslint:disable-next-line: prefer-for-of
            for (let i = 0; i < set.length; i++) {
                if (set[i].hasAttribute("style")) {
                    const s = set[i];
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

        eles.map(ele => ele.parentElement && ele.parentElement?.className === dragData.dragDivName ? (ele.parentElement.hidden = hideSource) : (ele.hidden = hideSource));

        let lastX = downX;
        let lastY = downY;
        const moveHandler = (e: PointerEvent) => {
            e.preventDefault(); // required or dragging text menu link item ends up dragging the link button as native drag/drop
            if (dragData instanceof DocumentDragData) {
                dragData.userDropAction = e.ctrlKey ? "alias" : undefined;
            }
            if (((options && !options.withoutShiftDrag) || !options) && e.shiftKey && CollectionDockingView.Instance) {
                AbortDrag();
                finishDrag && finishDrag(dragData);
                CollectionDockingView.Instance.StartOtherDrag({
                    pageX: e.pageX,
                    pageY: e.pageY,
                    preventDefault: emptyFunction,
                    button: 0
                }, dragData.droppedDocuments);
            }
            //TODO: Why can't we use e.movementX and e.movementY?
            const moveX = e.pageX - lastX;
            const moveY = e.pageY - lastY;
            lastX = e.pageX;
            lastY = e.pageY;
            dragElements.map((dragElement, i) => (dragElement.style.transform =
                `translate(${(xs[i] += moveX) + (options?.offsetX || 0)}px, ${(ys[i] += moveY) + (options?.offsetY || 0)}px)  scale(${scaleXs[i]}, ${scaleYs[i]})`)
            );
        };

        const hideDragShowOriginalElements = () => {
            dragElements.map(dragElement => dragElement.parentNode === dragDiv && dragDiv.removeChild(dragElement));
            eles.map(ele => ele.parentElement && ele.parentElement?.className === dragData.dragDivName ? (ele.parentElement.hidden = false) : (ele.hidden = false));
        };
        const endDrag = () => {
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
        const removed = dragData.dontHideOnDrop ? [] : dragEles.map(dragEle => {
            // let parent = dragEle.parentElement;
            // if (parent) parent.removeChild(dragEle);
            const ret = [dragEle, dragEle.style.width, dragEle.style.height];
            dragEle.style.width = "0";
            dragEle.style.height = "0";
            return ret;
        });
        const target = document.elementFromPoint(e.x, e.y);
        removed.map(r => {
            const dragEle = r[0] as HTMLElement;
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
Scripting.addGlobal(function convertToButtons(dragData: any) { convertDropDataToButtons(dragData as DragManager.DocumentDragData); });
