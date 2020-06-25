import { action, observable, runInAction } from "mobx";
import { DateField } from "../../fields/DateField";
import { Doc, Field, Opt } from "../../fields/Doc";
import { List } from "../../fields/List";
import { PrefetchProxy } from "../../fields/Proxy";
import { listSpec } from "../../fields/Schema";
import { SchemaHeaderField } from "../../fields/SchemaHeaderField";
import { ScriptField } from "../../fields/ScriptField";
import { Cast, NumCast, ScriptCast, StrCast } from "../../fields/Types";
import { emptyFunction } from "../../Utils";
import { Docs, DocUtils } from "../documents/Documents";
import * as globalCssVariables from "../views/globalCssVariables.scss";
import { UndoManager } from "./UndoManager";
import { SnappingManager } from "./SnappingManager";

export type dropActionType = "alias" | "copy" | "move" | "same" | undefined; // undefined = move
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
            dragStarted?.();
        }
    };
    const onRowUp = (): void => {
        document.removeEventListener("pointermove", onRowMove);
        document.removeEventListener('pointerup', onRowUp);
    };
    const onItemDown = async (e: React.PointerEvent) => {
        if (e.button === 0) {
            e.stopPropagation();
            if (e.shiftKey) {
                e.persist();
                const dragDoc = await docFunc();
                dragDoc && DragManager.StartWindowDrag?.({
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
    let dragLabel: HTMLDivElement;
    export let StartWindowDrag: Opt<((e: any, dragDocs: Doc[]) => void)> = undefined;

    export function Root() {
        const root = document.getElementById("root");
        if (!root) {
            throw new Error("No root element found");
        }
        return root;
    }
    export let AbortDrag: () => void = emptyFunction;
    export type MoveFunction = (document: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (document: Doc | Doc[]) => boolean) => boolean;
    export type RemoveFunction = (document: Doc | Doc[]) => boolean;

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
            readonly ctrlKey: boolean,
            readonly embedKey: boolean,
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
            this.droppedDocuments = [];
            this.offset = [0, 0];
        }
        draggedDocuments: Doc[];
        droppedDocuments: Doc[];
        dragDivName?: string;
        treeViewId?: string;
        dontHideOnDrop?: boolean;
        offset: number[];
        dropAction: dropActionType;
        removeDropProperties?: string[];
        userDropAction: dropActionType;
        moveDocument?: MoveFunction;
        removeDocument?: RemoveFunction;
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
        linkDropCallback?: (data: LinkDragData) => void;
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
        dropFunc: (e: Event, de: DropEvent) => void,
        doc?: Doc,
        preDropFunc?: (e: Event, de: DropEvent, targetAction: dropActionType) => void,
    ): DragDropDisposer {
        if ("canDrop" in element.dataset) {
            throw new Error(
                "Element is already droppable, can't make it droppable again"
            );
        }
        element.dataset.canDrop = "true";
        const handler = (e: Event) => dropFunc(e, (e as CustomEvent<DropEvent>).detail);
        const preDropHandler = (e: Event) => {
            const de = (e as CustomEvent<DropEvent>).detail;
            preDropFunc?.(e, de, StrCast(doc?.targetDropAction) as dropActionType);
        };
        element.addEventListener("dashOnDrop", handler);
        doc && element.addEventListener("dashPreDrop", preDropHandler);
        return () => {
            element.removeEventListener("dashOnDrop", handler);
            doc && element.removeEventListener("dashPreDrop", preDropHandler);
            delete element.dataset.canDrop;
        };
    }

    // drag a document and drop it (or make an alias/copy on drop)
    export function StartDocumentDrag(eles: HTMLElement[], dragData: DocumentDragData, downX: number, downY: number, options?: DragOptions) {
        const addAudioTag = (dropDoc: any) => {
            dropDoc && !dropDoc.creationDate && (dropDoc.creationDate = new DateField);
            dropDoc instanceof Doc && DocUtils.MakeLinkToActiveAudio(dropDoc);
            return dropDoc;
        };
        const batch = UndoManager.StartBatch("dragging");
        const finishDrag = (e: DragCompleteEvent) => {
            const docDragData = e.docDragData;
            if (docDragData && !docDragData.droppedDocuments.length) {
                docDragData.dropAction = dragData.userDropAction || dragData.dropAction;
                docDragData.droppedDocuments =
                    dragData.draggedDocuments.map(d => !dragData.isSelectionMove && !dragData.userDropAction && ScriptCast(d.onDragStart) ? addAudioTag(ScriptCast(d.onDragStart).script.run({ this: d }).result) :
                        docDragData.dropAction === "alias" ? Doc.MakeAlias(d) :
                            docDragData.dropAction === "copy" ? Doc.MakeDelegate(d) : d);
                docDragData.dropAction !== "same" && docDragData.droppedDocuments.forEach((drop: Doc, i: number) => {
                    const dragProps = Cast(dragData.draggedDocuments[i].removeDropProperties, listSpec("string"), []);
                    const remProps = (dragData?.removeDropProperties || []).concat(Array.from(dragProps));
                    remProps.map(prop => drop[prop] = undefined);
                });
                batch.end();
            }
            return e;
        };
        dragData.draggedDocuments.map(d => d.dragFactory); // does this help?  trying to make sure the dragFactory Doc is loaded
        StartDrag(eles, dragData, downX, downY, options, finishDrag);
    }

    // drag a button template and drop a new button 
    export function StartButtonDrag(eles: HTMLElement[], script: string, title: string, vars: { [name: string]: Field }, params: string[], initialize: (button: Doc) => void, downX: number, downY: number, options?: DragOptions) {
        const finishDrag = (e: DragCompleteEvent) => {
            const bd = Docs.Create.ButtonDocument({ _width: 150, _height: 50, title, onClick: ScriptField.MakeScript(script) });
            params.map(p => Object.keys(vars).indexOf(p) !== -1 && (Doc.GetProto(bd)[p] = new PrefetchProxy(vars[p] as Doc))); // copy all "captured" arguments into document parameterfields
            initialize?.(bd);
            Doc.GetProto(bd)["onClick-paramFieldKeys"] = new List<string>(params);
            e.docDragData && (e.docDragData.droppedDocuments = [bd]);
            return e;
        };
        StartDrag(eles, new DragManager.DocumentDragData([]), downX, downY, options, finishDrag);
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

    export function SetSnapLines(horizLines: number[], vertLines: number[]) {
        SnappingManager.setSnapLines(horizLines, vertLines);
    }
    export function snapDragAspect(dragPt: number[], snapAspect: number) {
        let closest = NumCast(Doc.UserDoc()["constants-snapThreshold"], 10);
        let near = dragPt;
        const intersect = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number, dragx: number, dragy: number) => {
            if ((x1 === x2 && y1 === y2) || (x3 === x4 && y3 === y4)) return undefined; // Check if none of the lines are of length 0
            const denominator = ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));
            if (denominator === 0) return undefined;  // Lines are parallel

            const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denominator;
            // let ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denominator;
            //if (ua < 0 || ua > 1 || ub < 0 || ub > 1)  return undefined;  // is the intersection along the segments

            // Return a object with the x and y coordinates of the intersection
            const x = x1 + ua * (x2 - x1);
            const y = y1 + ua * (y2 - y1);
            const dist = Math.sqrt((dragx - x) * (dragx - x) + (dragy - y) * (dragy - y));
            return { pt: [x, y], dist };
        };
        SnappingManager.vertSnapLines().forEach((xCoord, i) => {
            const pt = intersect(dragPt[0], dragPt[1], dragPt[0] + snapAspect, dragPt[1] + 1, xCoord, -1, xCoord, 1, dragPt[0], dragPt[1]);
            if (pt && pt.dist < closest) {
                closest = pt.dist;
                near = pt.pt;
            }
        });
        SnappingManager.horizSnapLines().forEach((yCoord, i) => {
            const pt = intersect(dragPt[0], dragPt[1], dragPt[0] + snapAspect, dragPt[1] + 1, -1, yCoord, 1, yCoord, dragPt[0], dragPt[1]);
            if (pt && pt.dist < closest) {
                closest = pt.dist;
                near = pt.pt;
            }
        });
        return { thisX: near[0], thisY: near[1] };
    }
    // snap to the active snap lines - if oneAxis is set (eg, for maintaining aspect ratios), then it only snaps to the nearest horizontal/vertical line 
    export function snapDrag(e: PointerEvent, xFromLeft: number, yFromTop: number, xFromRight: number, yFromBottom: number) {
        const snapThreshold = NumCast(Doc.UserDoc()["constants-snapThreshold"], 10);
        const snapVal = (pts: number[], drag: number, snapLines: number[]) => {
            if (snapLines.length) {
                const offs = [pts[0], (pts[0] - pts[1]) / 2, -pts[1]];   // offsets from drag pt
                const rangePts = [drag - offs[0], drag - offs[1], drag - offs[2]]; // left, mid, right or  top, mid, bottom pts to try to snap to snaplines
                const closestPts = rangePts.map(pt => snapLines.reduce((nearest, curr) => Math.abs(nearest - pt) > Math.abs(curr - pt) ? curr : nearest));
                const closestDists = rangePts.map((pt, i) => Math.abs(pt - closestPts[i]));
                const minIndex = closestDists[0] < closestDists[1] && closestDists[0] < closestDists[2] ? 0 : closestDists[1] < closestDists[2] ? 1 : 2;
                return closestDists[minIndex] < snapThreshold ? closestPts[minIndex] + offs[minIndex] : drag;
            }
            return drag;
        };
        return {
            thisX: snapVal([xFromLeft, xFromRight], e.pageX, SnappingManager.vertSnapLines()),
            thisY: snapVal([yFromTop, yFromBottom], e.pageY, SnappingManager.horizSnapLines())
        };
    }
    export let docsBeingDragged: Doc[] = [];
    export let CanEmbed = false;
    export function StartDrag(eles: HTMLElement[], dragData: { [id: string]: any }, downX: number, downY: number, options?: DragOptions, finishDrag?: (dropData: DragCompleteEvent) => void) {
        eles = eles.filter(e => e);
        CanEmbed = false;
        if (!dragDiv) {
            dragDiv = document.createElement("div");
            dragDiv.className = "dragManager-dragDiv";
            dragDiv.style.pointerEvents = "none";
            dragLabel = document.createElement("div");
            dragLabel.className = "dragManager-dragLabel";
            dragLabel.style.zIndex = "100001";
            dragLabel.style.fontSize = "10";
            dragLabel.style.position = "absolute";
            // dragLabel.innerText = "press 'a' to embed on drop"; // bcz: need to move this to a status bar
            dragDiv.appendChild(dragLabel);
            DragManager.Root().appendChild(dragDiv);
        }
        dragLabel.style.display = "";
        SnappingManager.SetIsDragging(true);
        const scaleXs: number[] = [];
        const scaleYs: number[] = [];
        const xs: number[] = [];
        const ys: number[] = [];

        docsBeingDragged = dragData instanceof DocumentDragData ? dragData.draggedDocuments : dragData instanceof PdfAnnoDragData ? [dragData.dragDocument] : [];
        const elesCont = {
            left: Number.MAX_SAFE_INTEGER,
            top: Number.MAX_SAFE_INTEGER,
            right: Number.MIN_SAFE_INTEGER,
            bottom: Number.MIN_SAFE_INTEGER
        };
        const dragElements = eles.map(ele => {
            if (!ele.parentNode) dragDiv.appendChild(ele);
            const dragElement = ele.parentNode === dragDiv ? ele : ele.cloneNode(true) as HTMLElement;
            const rect = ele.getBoundingClientRect();
            const scaleX = rect.width / ele.offsetWidth,
                scaleY = ele.offsetHeight ? rect.height / ele.offsetHeight : scaleX;
            elesCont.left = Math.min(rect.left, elesCont.left);
            elesCont.top = Math.min(rect.top, elesCont.top);
            elesCont.right = Math.max(rect.right, elesCont.right);
            elesCont.bottom = Math.max(rect.bottom, elesCont.bottom);
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
            dragLabel.style.transform = `translate(${rect.left + (options?.offsetX || 0)}px, ${rect.top + (options?.offsetY || 0) - 20}px)`;

            if (docsBeingDragged.length) {
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
        const xFromLeft = downX - elesCont.left;
        const yFromTop = downY - elesCont.top;
        const xFromRight = elesCont.right - downX;
        const yFromBottom = elesCont.bottom - downY;
        const moveHandler = (e: PointerEvent) => {
            e.preventDefault(); // required or dragging text menu link item ends up dragging the link button as native drag/drop
            if (dragData instanceof DocumentDragData) {
                dragData.userDropAction = e.ctrlKey && e.altKey ? "copy" : e.ctrlKey ? "alias" : undefined;
            }
            if (e?.shiftKey && dragData.draggedDocuments.length === 1) {
                dragData.dropAction = dragData.userDropAction || "same";
                if (dragData.dropAction === "move") {
                    dragData.removeDocument?.(dragData.draggedDocuments[0]);
                }
                AbortDrag();
                finishDrag?.(new DragCompleteEvent(true, dragData));
                DragManager.StartWindowDrag?.({
                    pageX: e.pageX,
                    pageY: e.pageY,
                    preventDefault: emptyFunction,
                    button: 0
                }, dragData.droppedDocuments);
            }

            const { thisX, thisY } = snapDrag(e, xFromLeft, yFromTop, xFromRight, yFromBottom);

            const moveX = thisX - lastX;
            const moveY = thisY - lastY;
            lastX = thisX;
            lastY = thisY;
            dragLabel.style.transform = `translate(${xs[0] + moveX + (options?.offsetX || 0)}px, ${ys[0] + moveY + (options?.offsetY || 0) - 20}px)`;
            dragElements.map((dragElement, i) => (dragElement.style.transform =
                `translate(${(xs[i] += moveX) + (options?.offsetX || 0)}px, ${(ys[i] += moveY) + (options?.offsetY || 0)}px)  scale(${scaleXs[i]}, ${scaleYs[i]})`)
            );
        };

        const hideDragShowOriginalElements = () => {
            dragLabel.style.display = "none";
            dragElements.map(dragElement => dragElement.parentNode === dragDiv && dragDiv.removeChild(dragElement));
            eles.map(ele => ele.parentElement && ele.parentElement?.className === dragData.dragDivName ? (ele.parentElement.hidden = false) : (ele.hidden = false));
        };
        const endDrag = action(() => {
            document.removeEventListener("pointermove", moveHandler, true);
            document.removeEventListener("pointerup", upHandler);
            SnappingManager.clearSnapLines();
        });

        AbortDrag = () => {
            hideDragShowOriginalElements();
            SnappingManager.SetIsDragging(false);
            options?.dragComplete?.(new DragCompleteEvent(true, dragData));
            endDrag();
        };
        const upHandler = (e: PointerEvent) => {
            hideDragShowOriginalElements();
            dispatchDrag(eles, e, dragData, xFromLeft, yFromTop, xFromRight, yFromBottom, options, finishDrag);
            SnappingManager.SetIsDragging(false);
            endDrag();
            options?.dragComplete?.(new DragCompleteEvent(false, dragData));
        };
        document.addEventListener("pointermove", moveHandler, true);
        document.addEventListener("pointerup", upHandler);
    }

    function dispatchDrag(dragEles: HTMLElement[], e: PointerEvent, dragData: { [index: string]: any },
        xFromLeft: number, yFromTop: number, xFromRight: number, yFromBottom: number, options?: DragOptions, finishDrag?: (e: DragCompleteEvent) => void) {
        const removed = dragData.dontHideOnDrop ? [] : dragEles.map(dragEle => {
            const ret = { ele: dragEle, w: dragEle.style.width, h: dragEle.style.height, o: dragEle.style.overflow };
            dragEle.style.width = "0";
            dragEle.style.height = "0";
            dragEle.style.overflow = "hidden";
            return ret;
        });
        const target = document.elementFromPoint(e.x, e.y);
        removed.map(r => {
            r.ele.style.width = r.w;
            r.ele.style.height = r.h;
            r.ele.style.overflow = r.o;
        });
        const { thisX, thisY } = snapDrag(e, xFromLeft, yFromTop, xFromRight, yFromBottom);
        if (target) {
            const complete = new DragCompleteEvent(false, dragData);
            target.dispatchEvent(
                new CustomEvent<DropEvent>("dashPreDrop", {
                    bubbles: true,
                    detail: {
                        x: thisX,
                        y: thisY,
                        complete: complete,
                        shiftKey: e.shiftKey,
                        altKey: e.altKey,
                        metaKey: e.metaKey,
                        ctrlKey: e.ctrlKey,
                        embedKey: CanEmbed
                    }
                })
            );
            finishDrag?.(complete);
            target.dispatchEvent(
                new CustomEvent<DropEvent>("dashOnDrop", {
                    bubbles: true,
                    detail: {
                        x: thisX,
                        y: thisY,
                        complete: complete,
                        shiftKey: e.shiftKey,
                        altKey: e.altKey,
                        metaKey: e.metaKey,
                        ctrlKey: e.ctrlKey,
                        embedKey: CanEmbed
                    }
                })
            );
        }
    }
}
