import * as htmlToImage from "html-to-image";
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, FieldResult } from "../../../../new_fields/Doc";
import { Id } from "../../../../new_fields/FieldSymbols";
import { InkField, StrokeData } from "../../../../new_fields/InkField";
import { List } from "../../../../new_fields/List";
import { Cast, NumCast } from "../../../../new_fields/Types";
import { Utils } from "../../../../Utils";
import { DocServer } from "../../../DocServer";
import { Docs } from "../../../documents/Documents";
import { SelectionManager } from "../../../util/SelectionManager";
import { Transform } from "../../../util/Transform";
import { undoBatch } from "../../../util/UndoManager";
import { InkingCanvas } from "../../InkingCanvas";
import { PreviewCursor } from "../../PreviewCursor";
import { Templates } from "../../Templates";
import { CollectionViewType } from "../CollectionBaseView";
import { CollectionFreeFormView } from "./CollectionFreeFormView";
import "./MarqueeView.scss";
import React = require("react");
import { SchemaHeaderField, RandomPastel } from "../../../../new_fields/SchemaHeaderField";

interface MarqueeViewProps {
    getContainerTransform: () => Transform;
    getTransform: () => Transform;
    container: CollectionFreeFormView;
    addDocument: (doc: Doc, allowDuplicates: false) => boolean;
    activeDocuments: () => Doc[];
    selectDocuments: (docs: Doc[]) => void;
    removeDocument: (doc: Doc) => boolean;
    addLiveTextDocument: (doc: Doc) => void;
    isSelected: () => boolean;
}

@observer
export class MarqueeView extends React.Component<MarqueeViewProps>
{
    private _mainCont = React.createRef<HTMLDivElement>();
    @observable _lastX: number = 0;
    @observable _lastY: number = 0;
    @observable _downX: number = 0;
    @observable _downY: number = 0;
    @observable _visible: boolean = false;
    _commandExecuted = false;

    @action
    cleanupInteractions = (all: boolean = false) => {
        if (all) {
            document.removeEventListener("pointerup", this.onPointerUp, true);
            document.removeEventListener("pointermove", this.onPointerMove, true);
        }
        document.removeEventListener("keydown", this.marqueeCommand, true);
        this._visible = false;
    }

    @undoBatch
    @action
    onKeyPress = (e: KeyboardEvent) => {
        //make textbox and add it to this collection
        let [x, y] = this.props.getTransform().transformPoint(this._downX, this._downY);
        if (e.key === "q" && e.ctrlKey) {
            e.preventDefault();
            (async () => {
                let text: string = await navigator.clipboard.readText();
                let ns = text.split("\n").filter(t => t.trim() !== "\r" && t.trim() !== "");
                for (let i = 0; i < ns.length - 1; i++) {
                    while (!(ns[i].trim() === "" || ns[i].endsWith("-\r") || ns[i].endsWith("-") ||
                        ns[i].endsWith(";\r") || ns[i].endsWith(";") ||
                        ns[i].endsWith(".\r") || ns[i].endsWith(".") ||
                        ns[i].endsWith(":\r") || ns[i].endsWith(":")) && i < ns.length - 1) {
                        let sub = ns[i].endsWith("\r") ? 1 : 0;
                        let br = ns[i + 1].trim() === "";
                        ns.splice(i, 2, ns[i].substr(0, ns[i].length - sub) + ns[i + 1].trimLeft());
                        if (br) break;
                    }
                }
                ns.map(line => {
                    let indent = line.search(/\S|$/);
                    let newBox = Docs.Create.TextDocument({ width: 200, height: 35, x: x + indent / 3 * 10, y: y, documentText: "@@@" + line, title: line });
                    this.props.addDocument(newBox, false);
                    y += 40 * this.props.getTransform().Scale;
                });
            })();
        } else if (e.key === "b" && e.ctrlKey) {
            e.preventDefault();
            navigator.clipboard.readText().then(text => {
                let ns = text.split("\n").filter(t => t.trim() !== "\r" && t.trim() !== "");
                if (ns.length === 1 && text.startsWith("http")) {
                    this.props.addDocument(Docs.Create.ImageDocument(text, { nativeWidth: 300, width: 300, x: x, y: y }), false);// paste an image from its URL in the paste buffer
                } else {
                    this.pasteTable(ns, x, y);
                }
            });
        } else if (!e.ctrlKey) {
            let newBox = Docs.Create.TextDocument({ width: 200, height: 100, x: x, y: y, title: "-typed text-" });
            newBox.proto!.autoHeight = true;
            this.props.addLiveTextDocument(newBox);
        }
        e.stopPropagation();
    }
    //heuristically converts pasted text into a table.
    // assumes each entry is separated by a tab
    // skips all rows until it gets to a row with more than one entry
    // assumes that 1st row has header entry for each column
    // assumes subsequent rows have entries for each column header OR
    //         any row that has only one column is a section header-- this header is then added as a column to subsequent rows until the next header
    // assumes each cell is a string or a number
    pasteTable(ns: string[], x: number, y: number) {
        while (ns.length > 0 && ns[0].split("\t").length < 2) {
            ns.splice(0, 1);
        }
        if (ns.length > 0) {
            let columns = ns[0].split("\t");
            let docList: Doc[] = [];
            let groupAttr: string | number = "";
            let rowProto = new Doc();
            rowProto.title = rowProto.Id;
            rowProto.width = 200;
            rowProto.isPrototype = true;
            for (let i = 1; i < ns.length - 1; i++) {
                let values = ns[i].split("\t");
                if (values.length === 1 && columns.length > 1) {
                    groupAttr = values[0];
                    continue;
                }
                let docDataProto = Doc.MakeDelegate(rowProto);
                docDataProto.isPrototype = true;
                columns.forEach((col, i) => docDataProto[columns[i]] = (values.length > i ? ((values[i].indexOf(Number(values[i]).toString()) !== -1) ? Number(values[i]) : values[i]) : undefined));
                if (groupAttr) {
                    docDataProto._group = groupAttr;
                }
                docDataProto.title = i.toString();
                let doc = Doc.MakeDelegate(docDataProto);
                doc.width = 200;
                docList.push(doc);
            }
            let newCol = Docs.Create.SchemaDocument([...(groupAttr ? [new SchemaHeaderField("_group", "#f1efeb")] : []), ...columns.filter(c => c).map(c => new SchemaHeaderField(c, "#f1efeb"))], docList, { x: x, y: y, title: "droppedTable", width: 300, height: 100 });

            this.props.addDocument(newCol, false);
        }
    }
    @action
    onPointerDown = (e: React.PointerEvent): void => {
        this._downX = this._lastX = e.pageX;
        this._downY = this._lastY = e.pageY;
        this._commandExecuted = false;
        PreviewCursor.Visible = false;
        this.cleanupInteractions(true);
        if (e.button === 2 || (e.button === 0 && e.altKey)) {
            document.addEventListener("pointermove", this.onPointerMove, true);
            document.addEventListener("pointerup", this.onPointerUp, true);
            document.addEventListener("keydown", this.marqueeCommand, true);
            if (e.altKey) {
                //e.stopPropagation(); // bcz: removed so that you can alt-click on button in a collection to switch link following behaviors.
                e.preventDefault();
            }
            // bcz: do we need this?   it kills the context menu on the main collection if !altKey
            // e.stopPropagation();
        }
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        this._lastX = e.pageX;
        this._lastY = e.pageY;
        if (!e.cancelBubble) {
            if (Math.abs(this._lastX - this._downX) > Utils.DRAG_THRESHOLD ||
                Math.abs(this._lastY - this._downY) > Utils.DRAG_THRESHOLD) {
                if (!this._commandExecuted) {
                    this._visible = true;
                }
                e.stopPropagation();
                e.preventDefault();
            }
        }
        if (e.altKey) {
            e.preventDefault();
        }
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        if (!this.props.container.props.active()) this.props.selectDocuments([this.props.container.props.Document]);
        // console.log("pointer up!");
        if (this._visible) {
            // console.log("visible");
            let mselect = this.marqueeSelect();
            if (!e.shiftKey) {
                SelectionManager.DeselectAll(mselect.length ? undefined : this.props.container.props.Document);
            }
            this.props.selectDocuments(mselect.length ? mselect : [this.props.container.props.Document]);
        }
        //console.log("invisible");
        this.cleanupInteractions(true);

        if (e.altKey) {
            e.preventDefault();
        }
    }

    @action
    onClick = (e: React.MouseEvent): void => {
        if (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD &&
            Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD) {
            PreviewCursor.Show(e.clientX, e.clientY, this.onKeyPress);
            // let the DocumentView stopPropagation of this event when it selects this document
        } else {  // why do we get a click event when the cursor have moved a big distance?
            // let's cut it off here so no one else has to deal with it.
            e.stopPropagation();
        }
    }

    intersectRect(r1: { left: number, top: number, width: number, height: number },
        r2: { left: number, top: number, width: number, height: number }) {
        return !(r2.left > r1.left + r1.width || r2.left + r2.width < r1.left || r2.top > r1.top + r1.height || r2.top + r2.height < r1.top);
    }

    @computed
    get Bounds() {
        let left = this._downX < this._lastX ? this._downX : this._lastX;
        let top = this._downY < this._lastY ? this._downY : this._lastY;
        let topLeft = this.props.getTransform().transformPoint(left, top);
        let size = this.props.getTransform().transformDirection(this._lastX - this._downX, this._lastY - this._downY);
        return { left: topLeft[0], top: topLeft[1], width: Math.abs(size[0]), height: Math.abs(size[1]) };
    }

    get ink() {
        let container = this.props.container.props.Document;
        let containerKey = this.props.container.props.fieldKey;
        let extensionDoc = Doc.resolvedFieldDataDoc(container, containerKey, "true");
        return Cast(extensionDoc.ink, InkField);
    }

    set ink(value: InkField | undefined) {
        let container = Doc.GetProto(this.props.container.props.Document);
        let containerKey = this.props.container.props.fieldKey;
        let extensionDoc = Doc.resolvedFieldDataDoc(container, containerKey, "true");
        extensionDoc.ink = value;
    }

    @undoBatch
    @action
    marqueeCommand = async (e: KeyboardEvent) => {
        if (this._commandExecuted || (e as any).propagationIsStopped) {
            return;
        }
        if (e.key === "Backspace" || e.key === "Delete" || e.key === "d") {
            this._commandExecuted = true;
            e.stopPropagation();
            (e as any).propagationIsStopped = true;
            this.marqueeSelect(false).map(d => this.props.removeDocument(d));
            if (this.ink) {
                this.marqueeInkDelete(this.ink.inkData);
            }
            SelectionManager.DeselectAll();
            this.cleanupInteractions(false);
            e.stopPropagation();
        }
        if (e.key === "c" || e.key === "s" || e.key === "S") {
            this._commandExecuted = true;
            e.stopPropagation();
            e.preventDefault();
            (e as any).propagationIsStopped = true;
            let bounds = this.Bounds;
            let selected = this.marqueeSelect(false);
            if (e.key === "c") {
                selected.map(d => {
                    this.props.removeDocument(d);
                    d.x = NumCast(d.x) - bounds.left - bounds.width / 2;
                    d.y = NumCast(d.y) - bounds.top - bounds.height / 2;
                    d.page = -1;
                    return d;
                });
            }
            let inkData = this.ink ? this.ink.inkData : undefined;
            let newCollection = Docs.Create.FreeformDocument(selected, {
                x: bounds.left,
                y: bounds.top,
                panX: 0,
                panY: 0,
                backgroundColor: this.props.container.isAnnotationOverlay ? undefined : "white",
                defaultBackgroundColor: this.props.container.isAnnotationOverlay ? undefined : "white",
                width: bounds.width,
                height: bounds.height,
                title: e.key === "s" || e.key === "S" ? "-summary-" : "a nested collection",
            });
            let dataExtensionField = Doc.CreateDocumentExtensionForField(newCollection, "data");
            dataExtensionField.ink = inkData ? new InkField(this.marqueeInkSelect(inkData)) : undefined;
            this.marqueeInkDelete(inkData);

            if (e.key === "s") {
                selected.map(d => {
                    this.props.removeDocument(d);
                    d.x = NumCast(d.x) - bounds.left - bounds.width / 2;
                    d.y = NumCast(d.y) - bounds.top - bounds.height / 2;
                    d.page = -1;
                    return d;
                });
                newCollection.chromeStatus = "disabled";
                let summary = Docs.Create.TextDocument({ x: bounds.left, y: bounds.top, width: 300, height: 100, backgroundColor: "#e2ad32" /* yellow */, title: "-summary-" });
                newCollection.proto!.summaryDoc = summary;
                selected = [newCollection];
                newCollection.x = bounds.left + bounds.width;
                summary.proto!.subBulletDocs = new List<Doc>(selected);
                summary.templates = new List<string>([Templates.Bullet.Layout]);
                let container = Docs.Create.FreeformDocument([summary, newCollection], { x: bounds.left, y: bounds.top, width: 300, height: 200, chromeStatus: "disabled", title: "-summary-" });
                container.viewType = CollectionViewType.Stacking;
                container.autoHeight = true;
                this.props.addLiveTextDocument(container);
                // });
            } else if (e.key === "S") {
                selected.map(d => {
                    this.props.removeDocument(d);
                    d.x = NumCast(d.x) - bounds.left - bounds.width / 2;
                    d.y = NumCast(d.y) - bounds.top - bounds.height / 2;
                    d.page = -1;
                    return d;
                });
                newCollection.chromeStatus = "disabled";
                let summary = Docs.Create.TextDocument({ x: bounds.left, y: bounds.top, width: 300, height: 100, backgroundColor: "#e2ad32" /* yellow */, title: "-summary-" });
                newCollection.proto!.summaryDoc = summary;
                selected = [newCollection];
                newCollection.x = bounds.left + bounds.width;
                //this.props.addDocument(newCollection, false);
                summary.proto!.summarizedDocs = new List<Doc>(selected);
                summary.proto!.maximizeLocation = "inTab";  // or "inPlace", or "onRight"
                summary.autoHeight = true;

                this.props.addLiveTextDocument(summary);
            }
            else {
                this.props.addDocument(newCollection, false);
                this.props.selectDocuments([newCollection]);
            }
            this.cleanupInteractions(false);
        }
    }
    @action
    marqueeInkSelect(ink: Map<any, any>) {
        let idata = new Map();
        let centerShiftX = 0 - (this.Bounds.left + this.Bounds.width / 2); // moves each point by the offset that shifts the selection's center to the origin.
        let centerShiftY = 0 - (this.Bounds.top + this.Bounds.height / 2);
        ink.forEach((value: StrokeData, key: string, map: any) => {
            if (InkingCanvas.IntersectStrokeRect(value, this.Bounds)) {
                idata.set(key,
                    {
                        pathData: value.pathData.map(val => ({ x: val.x + centerShiftX, y: val.y + centerShiftY })),
                        color: value.color,
                        width: value.width,
                        tool: value.tool,
                        page: -1
                    });
            }
        });
        return idata;
    }

    @action
    marqueeInkDelete(ink?: Map<any, any>) {
        // bcz: this appears to work but when you restart all the deleted strokes come back -- InkField isn't observing its changes so they aren't written to the DB.
        // ink.forEach((value: StrokeData, key: string, map: any) =>
        //     InkingCanvas.IntersectStrokeRect(value, this.Bounds) && ink.delete(key));

        if (ink) {
            let idata = new Map();
            ink.forEach((value: StrokeData, key: string, map: any) =>
                !InkingCanvas.IntersectStrokeRect(value, this.Bounds) && idata.set(key, value));
            this.ink = new InkField(idata);
        }
    }

    marqueeSelect(selectBackgrounds: boolean = true) {
        let selRect = this.Bounds;
        let selection: Doc[] = [];
        this.props.activeDocuments().filter(doc => !doc.isBackground && doc.z === undefined).map(doc => {
            var x = NumCast(doc.x);
            var y = NumCast(doc.y);
            var w = NumCast(doc.width);
            var h = NumCast(doc.height);
            if (this.intersectRect({ left: x, top: y, width: w, height: h }, selRect)) {
                selection.push(doc);
            }
        });
        if (!selection.length && selectBackgrounds) {
            this.props.activeDocuments().filter(doc => doc.z === undefined).map(doc => {
                var x = NumCast(doc.x);
                var y = NumCast(doc.y);
                var w = NumCast(doc.width);
                var h = NumCast(doc.height);
                if (this.intersectRect({ left: x, top: y, width: w, height: h }, selRect)) {
                    selection.push(doc);
                }
            });
        }
        if (!selection.length) {
            let left = this._downX < this._lastX ? this._downX : this._lastX;
            let top = this._downY < this._lastY ? this._downY : this._lastY;
            let topLeft = this.props.getContainerTransform().transformPoint(left, top);
            let size = this.props.getContainerTransform().transformDirection(this._lastX - this._downX, this._lastY - this._downY);
            let otherBounds = { left: topLeft[0], top: topLeft[1], width: Math.abs(size[0]), height: Math.abs(size[1]) };
            this.props.activeDocuments().filter(doc => doc.z !== undefined).map(doc => {
                var x = NumCast(doc.x);
                var y = NumCast(doc.y);
                var w = NumCast(doc.width);
                var h = NumCast(doc.height);
                if (this.intersectRect({ left: x, top: y, width: w, height: h }, otherBounds)) {
                    selection.push(doc);
                }
            });
        }
        return selection;
    }

    @computed
    get marqueeDiv() {
        let v = this.props.getContainerTransform().transformDirection(this._lastX - this._downX, this._lastY - this._downY);
        return <div className="marquee" style={{ width: `${Math.abs(v[0])}`, height: `${Math.abs(v[1])}`, zIndex: 2000 }} >
            <span className="marquee-legend" />
        </div>;
    }

    render() {
        let p: [number, number] = this._visible ? this.props.getContainerTransform().transformPoint(this._downX < this._lastX ? this._downX : this._lastX, this._downY < this._lastY ? this._downY : this._lastY) : [0, 0];
        return <div className="marqueeView" style={{ borderRadius: "inherit" }} onClick={this.onClick} onPointerDown={this.onPointerDown}>
            <div style={{ position: "relative", transform: `translate(${p[0]}px, ${p[1]}px)` }} >
                {this._visible ? this.marqueeDiv : null}
                <div ref={this._mainCont} style={{ transform: `translate(${-p[0]}px, ${-p[1]}px)` }} >
                    {this.props.children}
                </div>
            </div>
        </div>;
    }
}