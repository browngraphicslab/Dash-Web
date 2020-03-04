import { Doc, Field, DocListCast } from "../../new_fields/Doc";
import { Cast, ScriptCast } from "../../new_fields/Types";
import { emptyFunction } from "../../Utils";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import * as globalCssVariables from "../views/globalCssVariables.scss";
import { DocumentManager } from "./DocumentManager";
import { LinkManager } from "./LinkManager";
import { SelectionManager } from "./SelectionManager";
import { SchemaHeaderField } from "../../new_fields/SchemaHeaderField";
import { Docs, DocUtils } from "../documents/Documents";
import { ScriptField } from "../../new_fields/ScriptField";
import { List } from "../../new_fields/List";
import { PrefetchProxy } from "../../new_fields/Proxy";
import { listSpec } from "../../new_fields/Schema";
import { Scripting } from "./Scripting";
import { convertDropDataToButtons } from "./DropConverter";
import { AudioBox } from "../views/nodes/AudioBox";

export type dropActionType = "alias" | "copy" | undefined;
export function SetupDrag(
    _reference: React.RefObject<HTMLElement>,
    docFunc: () => Doc | Promise<Doc> | undefined,
    moveFunc?: DragManager.MoveFunction,
    dropAction?: dropActionType,
    treeViewId?: string,
    dontHideOnDrop?: boolean,
    dragStarted?: () => void
) {
    const onRowMove = async (e: PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();

        document.removeEventListener("pointermove", onRowMove);
        document.removeEventListener('pointerup', onRowUp);
        const doc = await docFunc();
        if (doc) {
            const dragData = new DragManager.DocumentDragData([doc]);
            dragData.dropAction = dropAction;
            dragData.moveDocument = moveFunc;
            dragData.treeViewId = treeViewId;
            dragData.dontHideOnDrop = dontHideOnDrop;
            DragManager.StartDocumentDrag([_reference.current!], dragData, e.x, e.y);
            dragStarted && dragStarted();
        }
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
                const dragDoc = await docFunc();
                dragDoc && CollectionDockingView.Instance.StartOtherDrag({
                    pageX: e.pageX,
                    pageY: e.pageY,
                    preventDefault: emptyFunction,
                    button: 0
                }, [dragDoc]);
            } else {
                document.addEventListener("pointermove", onRowMove);
                document.addEventListener("pointerup", onRowUp);
            }
        }
    };
    return onItemDown;
}

export namespace DragManager {
    let dragDiv: HTMLDivElement;

    export function Root() {
        const root = document.getElementById("root");
        if (!root) {
            throw new Error("No root element found");
        }
        return root;
    }
    export let AbortDrag: () => void = emptyFunction;
    export type MoveFunction = (document: Doc, targetCollection: Doc | undefined, addDocument: (document: Doc) => boolean) => boolean;

    export interface DragDropDisposer { (): void; }
    export interface DragOptions {
        dragComplete?: (e: DragCompleteEvent) => void; // function to invoke when drag has completed
        hideSource?: boolean;  // hide source document during drag
        offsetX?: number;      // offset of top left of source drag visual from cursor
        offsetY?: number;
    }

    // event called when the drag operation results in a drop action
    export class DropEvent {
        constructor(
            readonly x: number,
            readonly y: number,
            readonly complete: DragCompleteEvent,
            readonly shiftKey: boolean,
            readonly altKey: boolean,
            readonly metaKey: boolean,
            readonly ctrlKey: boolean
        ) { }
    }

    // event called when the drag operation has completed (aborted or completed a drop) -- this will be after any drop event has been generated
    export class DragCompleteEvent {
        constructor(aborted: boolean, dragData: { [id: string]: any }) {
            this.aborted = aborted;
            this.docDragData = dragData instanceof DocumentDragData ? dragData : undefined;
            this.annoDragData = dragData instanceof PdfAnnoDragData ? dragData : undefined;
            this.linkDragData = dragData instanceof LinkDragData ? dragData : undefined;
            this.columnDragData = dragData instanceof ColumnDragData ? dragData : undefined;
        }
        aborted: boolean;
        docDragData?: DocumentDragData;
        annoDragData?: PdfAnnoDragData;
        linkDragData?: LinkDragData;
        columnDragData?: ColumnDragData;
    }

    export class DocumentDragData {
        constructor(dragDoc: Doc[]) {
            this.draggedDocuments = dragDoc;
            this.droppedDocuments = dragDoc;
            this.offset = [0, 0];
        }
        draggedDocuments: Doc[];
        droppedDocuments: Doc[];
        dragDivName?: string;
        treeViewId?: string;
        dontHideOnDrop?: boolean;
        offset: number[];
        dropAction: dropActionType;
        userDropAction: dropActionType;
        embedDoc?: boolean;
        moveDocument?: MoveFunction;
        applyAsTemplate?: boolean;
        isSelectionMove?: boolean; // indicates that an explicitly selected Document is being dragged.  this will suppress onDragStart scripts
    }
    export class LinkDragData {
        constructor(linkSourceDoc: Doc) {
            this.linkSourceDocument = linkSourceDoc;
        }
        droppedDocuments: Doc[] = [];
        linkSourceDocument: Doc;
        dontClearTextBox?: boolean;
        linkDocument?: Doc;
    }
    export class ColumnDragData {
        constructor(colKey: SchemaHeaderField) {
            this.colKey = colKey;
        }
        colKey: SchemaHeaderField;
    }
    // used by PDFs to conditionally (if the drop completes) create a text annotation when dragging from the PDF toolbar when a text region has been selected.
    // this is pretty clunky and should be rethought out using linkDrag or DocumentDrag
    export class PdfAnnoDragData {
        constructor(dragDoc: Doc, annotationDoc: Doc, dropDoc: Doc) {
            this.dragDocument = dragDoc;
            this.dropDocument = dropDoc;
            this.annotationDocument = annotationDoc;
            this.offset = [0, 0];
        }
        linkedToDoc?: boolean;
        targetContext: Doc | undefined;
        dragDocument: Doc;
        annotationDocument: Doc;
        dropDocument: Doc;
        offset: number[];
        dropAction: dropActionType;
        userDropAction: dropActionType;
    }

    export function MakeDropTarget(
        element: HTMLElement,
        dropFunc: (e: Event, de: DropEvent) => void
    ): DragDropDisposer {
        if ("canDrop" in element.dataset) {
            throw new Error(
                "Element is already droppable, can't make it droppable again"
            );
        }
        element.dataset.canDrop = "true";
        const handler = (e: Event) => { dropFunc(e, (e as CustomEvent<DropEvent>).detail); };
        element.addEventListener("dashOnDrop", handler);
        return () => {
            element.removeEventListener("dashOnDrop", handler);
            delete element.dataset.canDrop;
        };
    }

    // drag a document and drop it (or make an alias/copy on drop)
    export function StartDocumentDrag(eles: HTMLElement[], dragData: DocumentDragData, downX: number, downY: number, options?: DragOptions) {
        const addAudioTag = (dropDoc: any) => {
            dropDoc instanceof Doc && AudioBox.ActiveRecordings.map(d => DocUtils.MakeLink({ doc: dropDoc }, { doc: d }, "audio link", "audio timeline"));
            return dropDoc;
        }
        const finishDrag = (e: DragCompleteEvent) => {
            e.docDragData && (e.docDragData.droppedDocuments =
                dragData.draggedDocuments.map(d => !dragData.isSelectionMove && !dragData.userDropAction && ScriptCast(d.onDragStart) ? addAudioTag(ScriptCast(d.onDragStart).script.run({ this: d }).result) :
                    dragData.userDropAction === "alias" || (!dragData.userDropAction && dragData.dropAction === "alias") ? Doc.MakeAlias(d) :
                        dragData.userDropAction === "copy" || (!dragData.userDropAction && dragData.dropAction === "copy") ? Doc.MakeCopy(d, true) : d)
            );
            e.docDragData?.droppedDocuments.forEach((drop: Doc, i: number) =>
                Cast(dragData.draggedDocuments[i].removeDropProperties, listSpec("string"), []).map(prop => {
                    drop[prop] = undefined;
                })
            );
        };
        dragData.draggedDocuments.map(d => d.dragFactory); // does this help?  trying to make sure the dragFactory Doc is loaded
        StartDrag(eles, dragData, downX, downY, options, finishDrag);
    }

    // drag a button template and drop a new button 
    export function StartButtonDrag(eles: HTMLElement[], script: string, title: string, vars: { [name: string]: Field }, params: string[], initialize: (button: Doc) => void, downX: number, downY: number, options?: DragOptions) {
        const finishDrag = (e: DragCompleteEvent) => {
            const bd = Docs.Create.ButtonDocument({ _width: 150, _height: 50, title: title });
            bd.onClick = ScriptField.MakeScript(script);
            params.map(p => Object.keys(vars).indexOf(p) !== -1 && (Doc.GetProto(bd)[p] = new PrefetchProxy(vars[p] as Doc)));
            initialize && initialize(bd);
            bd.buttonParams = new List<string>(params);
            e.docDragData && (e.docDragData.droppedDocuments = [bd]);
        };
        StartDrag(eles, new DragManager.DocumentDragData([]), downX, downY, options, finishDrag);
    }

    // drag links and drop link targets (aliasing them if needed)
    export async function StartLinkTargetsDrag(dragEle: HTMLElement, downX: number, downY: number, sourceDoc: Doc, specificLinks?: Doc[]) {
        const draggedDocs = (specificLinks ? specificLinks : DocListCast(sourceDoc.links)).map(link => LinkManager.Instance.getOppositeAnchor(link, sourceDoc)).filter(l => l) as Doc[];

        if (draggedDocs.length) {
            const moddrag: Doc[] = [];
            for (const draggedDoc of draggedDocs) {
                const doc = await Cast(draggedDoc.annotationOn, Doc);
                if (doc) moddrag.push(doc);
            }

            const dragData = new DragManager.DocumentDragData(moddrag.length ? moddrag : draggedDocs);
            dragData.moveDocument = (doc: Doc, targetCollection: Doc | undefined, addDocument: (doc: Doc) => boolean): boolean => {
                const document = SelectionManager.SelectedDocuments()[0];
                document && document.props.removeDocument && document.props.removeDocument(doc);
                addDocument(doc);
                return true;
            };
            const containingView = SelectionManager.SelectedDocuments()[0] ? SelectionManager.SelectedDocuments()[0].props.ContainingCollectionView : undefined;
            const finishDrag = (e: DragCompleteEvent) =>
                e.docDragData && (e.docDragData.droppedDocuments =
                    dragData.draggedDocuments.reduce((droppedDocs, d) => {
                        const dvs = DocumentManager.Instance.getDocumentViews(d).filter(dv => dv.props.ContainingCollectionView === containingView);
                        if (dvs.length) {
                            dvs.forEach(dv => droppedDocs.push(dv.props.Document));
                        } else {
                            droppedDocs.push(Doc.MakeAlias(d));
                        }
                        return droppedDocs;
                    }, [] as Doc[]));

            StartDrag([dragEle], dragData, downX, downY, undefined, finishDrag);
        }
    }

    // drag&drop the pdf annotation anchor which will create a text note  on drop via a dropCompleted() DragOption 
    export function StartPdfAnnoDrag(eles: HTMLElement[], dragData: PdfAnnoDragData, downX: number, downY: number, options?: DragOptions) {
        StartDrag(eles, dragData, downX, downY, options);
    }

    // drags a linker button and creates a link on drop
    export function StartLinkDrag(ele: HTMLElement, sourceDoc: Doc, downX: number, downY: number, options?: DragOptions) {
        StartDrag([ele], new DragManager.LinkDragData(sourceDoc), downX, downY, options);
    }

    // drags a column from a schema view
    export function StartColumnDrag(ele: HTMLElement, dragData: ColumnDragData, downX: number, downY: number, options?: DragOptions) {
        StartDrag([ele], dragData, downX, downY, options);
    }

    export function StartImgDrag(ele: HTMLElement, downX: number, downY: number) {
        StartDrag([ele], {}, downX, downY);
    }

    function StartDrag(eles: HTMLElement[], dragData: { [id: string]: any }, downX: number, downY: number, options?: DragOptions, finishDrag?: (dropData: DragCompleteEvent) => void) {
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

        const docs = dragData instanceof DocumentDragData ? dragData.draggedDocuments : dragData instanceof PdfAnnoDragData ? [dragData.dragDocument] : [];
        const dragElements = eles.map(ele => {
            if (!ele.parentNode) dragDiv.appendChild(ele);
            const dragElement = ele.parentNode === dragDiv ? ele : ele.cloneNode(true) as HTMLElement;
            const rect = ele.getBoundingClientRect();
            const scaleX = rect.width / ele.offsetWidth,
                scaleY = rect.height / ele.offsetHeight;
            xs.push(rect.left);
            ys.push(rect.top);
            scaleXs.push(scaleX);
            scaleYs.push(scaleY);
            dragElement.style.opacity = "0.7";
            dragElement.style.position = "absolute";
            dragElement.style.margin = "0";
            dragElement.style.top = "0";
            dragElement.style.bottom = "";
            dragElement.style.left = "0";
            dragElement.style.color = "black";
            dragElement.style.transition = "none";
            dragElement.style.transformOrigin = "0 0";
            dragElement.style.borderRadius = getComputedStyle(ele).borderRadius;
            dragElement.style.zIndex = globalCssVariables.contextMenuZindex;// "1000";
            dragElement.style.transform = `translate(${rect.left + (options?.offsetX || 0)}px, ${rect.top + (options?.offsetY || 0)}px) scale(${scaleX}, ${scaleY})`;
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
            if (dragElement.hasAttribute("style")) (dragElement as any).style.pointerEvents = "none";
            const set = dragElement.getElementsByTagName('*');
            // tslint:disable-next-line: prefer-for-of
            for (let i = 0; i < set.length; i++) {
                set[i].hasAttribute("style") && ((set[i] as any).style.pointerEvents = "none");
            }

            dragDiv.appendChild(dragElement);
            return dragElement;
        });

        const hideSource = options?.hideSource ? true : false;
        eles.map(ele => ele.parentElement && ele.parentElement?.className === dragData.dragDivName ? (ele.parentElement.hidden = hideSource) : (ele.hidden = hideSource));

        let lastX = downX;
        let lastY = downY;
        const moveHandler = (e: PointerEvent) => {
            e.preventDefault(); // required or dragging text menu link item ends up dragging the link button as native drag/drop
            if (dragData instanceof DocumentDragData) {
                dragData.userDropAction = e.ctrlKey ? "alias" : undefined;
            }
            if (e.shiftKey && CollectionDockingView.Instance && dragData.droppedDocuments.length === 1) {
                AbortDrag();
                finishDrag?.(new DragCompleteEvent(true, dragData));
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
        };

        AbortDrag = () => {
            hideDragShowOriginalElements();
            SelectionManager.SetIsDragging(false);
            options?.dragComplete?.(new DragCompleteEvent(true, dragData));
            endDrag();
        };
        const upHandler = (e: PointerEvent) => {
            hideDragShowOriginalElements();
            dispatchDrag(eles, e, dragData, options, finishDrag);
            SelectionManager.SetIsDragging(false);
            endDrag();
            options?.dragComplete?.(new DragCompleteEvent(false, dragData));
        };
        document.addEventListener("pointermove", moveHandler, true);
        document.addEventListener("pointerup", upHandler);
    }

    function dispatchDrag(dragEles: HTMLElement[], e: PointerEvent, dragData: { [index: string]: any }, options?: DragOptions, finishDrag?: (e: DragCompleteEvent) => void) {
        const removed = dragData.dontHideOnDrop ? [] : dragEles.map(dragEle => {
            const ret = { ele: dragEle, w: dragEle.style.width, h: dragEle.style.height };
            dragEle.style.width = "0";
            dragEle.style.height = "0";
            return ret;
        });
        const target = document.elementFromPoint(e.x, e.y);
        removed.map(r => {
            r.ele.style.width = r.w;
            r.ele.style.height = r.h;
        });
        if (target) {
            const complete = new DragCompleteEvent(false, dragData);
            finishDrag?.(complete);
            console.log(complete.aborted);
            target.dispatchEvent(
                new CustomEvent<DropEvent>("dashOnDrop", {
                    bubbles: true,
                    detail: {
                        x: e.x,
                        y: e.y,
                        complete: complete,
                        shiftKey: e.shiftKey,
                        altKey: e.altKey,
                        metaKey: e.metaKey,
                        ctrlKey: e.ctrlKey
                    }
                })
            );
        }
    }
}
Scripting.addGlobal(function convertToButtons(dragData: any) { convertDropDataToButtons(dragData as DragManager.DocumentDragData); });
