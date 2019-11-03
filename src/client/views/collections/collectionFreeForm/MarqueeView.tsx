import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../../../new_fields/Doc";
import { InkField, StrokeData } from "../../../../new_fields/InkField";
import { List } from "../../../../new_fields/List";
import { listSpec } from "../../../../new_fields/Schema";
import { SchemaHeaderField } from "../../../../new_fields/SchemaHeaderField";
import { ComputedField } from "../../../../new_fields/ScriptField";
import { Cast, NumCast, StrCast } from "../../../../new_fields/Types";
import { CurrentUserUtils } from "../../../../server/authentication/models/current_user_utils";
import { Utils } from "../../../../Utils";
import { Docs } from "../../../documents/Documents";
import { SelectionManager } from "../../../util/SelectionManager";
import { Transform } from "../../../util/Transform";
import { undoBatch } from "../../../util/UndoManager";
import { InkingCanvas } from "../../InkingCanvas";
import { PreviewCursor } from "../../PreviewCursor";
import { CollectionViewType } from "../CollectionView";
import { CollectionFreeFormView } from "./CollectionFreeFormView";
import "./MarqueeView.scss";
import React = require("react");
import MarqueeOptionsMenu from "./MarqueeOptionsMenu";
import InkSelectDecorations from "../../InkSelectDecorations";
import { SubCollectionViewProps } from "../CollectionSubView";

interface MarqueeViewProps {
    getContainerTransform: () => Transform;
    getTransform: () => Transform;
    addDocument: (doc: Doc) => boolean;
    activeDocuments: () => Doc[];
    selectDocuments: (docs: Doc[], ink: { Document: Doc, Ink: Map<any, any> }[]) => void;
    removeDocument: (doc: Doc) => boolean;
    addLiveTextDocument: (doc: Doc) => void;
    isSelected: () => boolean;
    extensionDoc: Doc;
    isAnnotationOverlay?: boolean;
    setPreviewCursor?: (func: (x: number, y: number, drag: boolean) => void) => void;
}

@observer
export class MarqueeView extends React.Component<SubCollectionViewProps & MarqueeViewProps>
{
    private _mainCont = React.createRef<HTMLDivElement>();
    @observable _lastX: number = 0;
    @observable _lastY: number = 0;
    @observable _downX: number = 0;
    @observable _downY: number = 0;
    @observable _visible: boolean = false;
    _commandExecuted = false;

    componentDidMount() {
        this.props.setPreviewCursor && this.props.setPreviewCursor(this.setPreviewCursor);
    }

    @action
    cleanupInteractions = (all: boolean = false, hideMarquee: boolean = true) => {
        if (all) {
            document.removeEventListener("pointerup", this.onPointerUp, true);
            document.removeEventListener("pointermove", this.onPointerMove, true);
        }
        document.removeEventListener("keydown", this.marqueeCommand, true);
        if (hideMarquee) {
            this._visible = false;
        }
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
                    this.props.addDocument(newBox);
                    y += 40 * this.props.getTransform().Scale;
                });
            })();
        } else if (e.key === "b" && e.ctrlKey) {
            e.preventDefault();
            navigator.clipboard.readText().then(text => {
                let ns = text.split("\n").filter(t => t.trim() !== "\r" && t.trim() !== "");
                if (ns.length === 1 && text.startsWith("http")) {
                    this.props.addDocument(Docs.Create.ImageDocument(text, { nativeWidth: 300, width: 300, x: x, y: y }));// paste an image from its URL in the paste buffer
                } else {
                    this.pasteTable(ns, x, y);
                }
            });
        } else if (!e.ctrlKey) {
            this.props.addLiveTextDocument(
                Docs.Create.TextDocument({ width: 200, height: 100, x: x, y: y, autoHeight: true, title: "-typed text-" }));
        } else if (e.keyCode > 48 && e.keyCode <= 57) {
            let notes = DocListCast((CurrentUserUtils.UserDocument.noteTypes as Doc).data);
            let text = Docs.Create.TextDocument({ width: 200, height: 100, x: x, y: y, autoHeight: true, title: "-typed text-" });
            text.layout = notes[(e.keyCode - 49) % notes.length];
            this.props.addLiveTextDocument(text);
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

            this.props.addDocument(newCol);
        }
    }
    @action
    onPointerDown = (e: React.PointerEvent): void => {
        this._downX = this._lastX = e.clientX;
        this._downY = this._lastY = e.clientY;
        if (e.button === 2 || (e.button === 0 && e.altKey)) {
            this.setPreviewCursor(e.clientX, e.clientY, true);
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
        } else {
            this.cleanupInteractions(true); // stop listening for events if another lower-level handle (e.g. another Marquee) has stopPropagated this
        }
        if (e.altKey) {
            e.preventDefault();
        }
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        if (!this.props.active()) this.props.selectDocuments([this.props.Document], []);
        if (this._visible) {
            let mselect = this.marqueeSelect();
            if (!e.shiftKey) {
                SelectionManager.DeselectAll(mselect.length ? undefined : this.props.Document);
            }
            let inkselect = this.ink ? this.marqueeInkSelect(this.ink.inkData) : new Map();
            let inks = inkselect.size ? [{ Document: this.inkDoc, Ink: inkselect }] : [];
            let docs = mselect.length ? mselect : (inks.length ? [] : [this.props.Document]);
            this.props.selectDocuments(docs, inks);
        }
        if (!this._commandExecuted && (Math.abs(this.Bounds.height * this.Bounds.width) > 100)) {
            MarqueeOptionsMenu.Instance.createCollection = this.collection;
            MarqueeOptionsMenu.Instance.delete = this.delete;
            MarqueeOptionsMenu.Instance.summarize = this.summary;
            MarqueeOptionsMenu.Instance.showMarquee = this.showMarquee;
            MarqueeOptionsMenu.Instance.hideMarquee = this.hideMarquee;
            MarqueeOptionsMenu.Instance.jumpTo(e.clientX, e.clientY);
        }
        this.cleanupInteractions(true, this._commandExecuted);

        let hideMarquee = () => {
            this.hideMarquee();
            MarqueeOptionsMenu.Instance.fadeOut(true);
            document.removeEventListener("pointerdown", hideMarquee);
        }
        document.addEventListener("pointerdown", hideMarquee);

        if (e.altKey) {
            e.preventDefault();
        }
    }

    setPreviewCursor = action((x: number, y: number, drag: boolean) => {
        if (drag) {
            this._downX = this._lastX = x;
            this._downY = this._lastY = y;
            this._commandExecuted = false;
            PreviewCursor.Visible = false;
            this.cleanupInteractions(true);
            document.addEventListener("pointermove", this.onPointerMove, true);
            document.addEventListener("pointerup", this.onPointerUp, true);
            document.addEventListener("keydown", this.marqueeCommand, true);
        } else {
            this._downX = x;
            this._downY = y;
            PreviewCursor.Show(x, y, this.onKeyPress, this.props.addLiveTextDocument, this.props.getTransform, this.props.addDocument);
        }
    });

    @action
    onClick = (e: React.MouseEvent): void => {
        if (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD &&
            Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD) {
            this.setPreviewCursor(e.clientX, e.clientY, false);
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

    get inkDoc() {
        return this.props.extensionDoc;
    }

    get ink() { // ink will be stored on the extension doc for the field (fieldKey) where the container's data is stored.
        return this.props.extensionDoc && Cast(this.props.extensionDoc.ink, InkField);
    }

    set ink(value: InkField | undefined) {
        this.props.extensionDoc && (this.props.extensionDoc.ink = value);
    }

    @action
    showMarquee = () => {
        this._visible = true;
    }

    @action
    hideMarquee = () => {
        this._visible = false;
    }

    @action
    delete = () => {
        this.marqueeSelect(false).map(d => this.props.removeDocument(d));
        if (this.ink) {
            this.marqueeInkDelete(this.ink.inkData);
        }
        SelectionManager.DeselectAll();
        this.cleanupInteractions(false);
        MarqueeOptionsMenu.Instance.fadeOut(true);
        this.hideMarquee();
    }

    getCollection = (selected: Doc[]) => {
        let bounds = this.Bounds;
        let defaultPalette = ["rgb(114,229,239)", "rgb(255,246,209)", "rgb(255,188,156)", "rgb(247,220,96)", "rgb(122,176,238)",
            "rgb(209,150,226)", "rgb(127,235,144)", "rgb(252,188,189)", "rgb(247,175,81)",];
        let colorPalette = Cast(this.props.Document.colorPalette, listSpec("string"));
        if (!colorPalette) this.props.Document.colorPalette = new List<string>(defaultPalette);
        let palette = Array.from(Cast(this.props.Document.colorPalette, listSpec("string")) as string[]);
        let usedPaletted = new Map<string, number>();
        [...this.props.activeDocuments(), this.props.Document].map(child => {
            let bg = StrCast(Doc.Layout(child).backgroundColor);
            if (palette.indexOf(bg) !== -1) {
                palette.splice(palette.indexOf(bg), 1);
                if (usedPaletted.get(bg)) usedPaletted.set(bg, usedPaletted.get(bg)! + 1);
                else usedPaletted.set(bg, 1);
            }
        });
        usedPaletted.delete("#f1efeb");
        usedPaletted.delete("white");
        usedPaletted.delete("rgba(255,255,255,1)");
        let usedSequnce = Array.from(usedPaletted.keys()).sort((a, b) => usedPaletted.get(a)! < usedPaletted.get(b)! ? -1 : usedPaletted.get(a)! > usedPaletted.get(b)! ? 1 : 0);
        let chosenColor = (usedPaletted.size === 0) ? "white" : palette.length ? palette[0] : usedSequnce[0];
        let inkData = this.ink ? this.ink.inkData : undefined;
        let newCollection = Docs.Create.FreeformDocument(selected, {
            x: bounds.left,
            y: bounds.top,
            panX: 0,
            panY: 0,
            backgroundColor: this.props.isAnnotationOverlay ? undefined : chosenColor,
            defaultBackgroundColor: this.props.isAnnotationOverlay ? undefined : chosenColor,
            width: bounds.width,
            height: bounds.height,
            title: "a nested collection",
        });
        let dataExtensionField = Doc.CreateDocumentExtensionForField(newCollection, "data");
        dataExtensionField.ink = inkData ? new InkField(this.marqueeInkSelect(inkData)) : undefined;
        this.marqueeInkDelete(inkData);
        this.hideMarquee();
        return newCollection;
    }

    @action
    collection = (e: KeyboardEvent | React.PointerEvent | undefined) => {
        let bounds = this.Bounds;
        let selected = this.marqueeSelect(false);
        if (e instanceof KeyboardEvent ? e.key === "c" : true) {
            selected.map(d => {
                this.props.removeDocument(d);
                d.x = NumCast(d.x) - bounds.left - bounds.width / 2;
                d.y = NumCast(d.y) - bounds.top - bounds.height / 2;
                d.displayTimecode = undefined;
                return d;
            });
        }
        let newCollection = this.getCollection(selected);
        this.props.addDocument(newCollection);
        this.props.selectDocuments([newCollection], []);
        MarqueeOptionsMenu.Instance.fadeOut(true);
        this.hideMarquee();
    }

    @action
    summary = (e: KeyboardEvent | React.PointerEvent | undefined) => {
        let bounds = this.Bounds;
        let selected = this.marqueeSelect(false);
        let newCollection = this.getCollection(selected);

        selected.map(d => {
            this.props.removeDocument(d);
            d.x = NumCast(d.x) - bounds.left - bounds.width / 2;
            d.y = NumCast(d.y) - bounds.top - bounds.height / 2;
            d.page = -1;
            return d;
        });
        newCollection.chromeStatus = "disabled";
        let summary = Docs.Create.TextDocument({ x: bounds.left, y: bounds.top, width: 300, height: 100, autoHeight: true, backgroundColor: "#e2ad32" /* yellow */, title: "-summary-" });
        Doc.GetProto(summary).summarizedDocs = new List<Doc>([newCollection]);
        newCollection.x = bounds.left + bounds.width;
        Doc.GetProto(newCollection).summaryDoc = summary;
        Doc.GetProto(newCollection).title = ComputedField.MakeFunction(`summaryTitle(this);`);
        if (e instanceof KeyboardEvent ? e.key === "s" : true) { // summary is wrapped in an expand/collapse container that also contains the summarized documents in a free form view.
            let container = Docs.Create.FreeformDocument([summary, newCollection], { x: bounds.left, y: bounds.top, width: 300, height: 200, chromeStatus: "disabled", title: "-summary-" });
            container.viewType = CollectionViewType.Stacking;
            container.autoHeight = true;
            Doc.GetProto(summary).maximizeLocation = "inPlace";  // or "onRight"
            this.props.addLiveTextDocument(container);
        } else if (e instanceof KeyboardEvent ? e.key === "S" : false) { // the summary stands alone, but is linked to a collection of the summarized documents - set the OnCLick behavior to link follow to access them
            Doc.GetProto(summary).maximizeLocation = "inTab";  // or "inPlace", or "onRight"
            this.props.addLiveTextDocument(summary);
        }
        MarqueeOptionsMenu.Instance.fadeOut(true);
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
            this.delete();
            e.stopPropagation();
        }
        if (e.key === "c" || e.key === "s" || e.key === "S") {
            this._commandExecuted = true;
            e.stopPropagation();
            e.preventDefault();
            (e as any).propagationIsStopped = true;
            if (e.key === "c") {
                this.collection(e);
            }

            if (e.key === "s" || e.key === "S") {
                this.summary(e);
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
                // let transform = this.props.container.props.ScreenToLocalTransform().scale(this.props.container.props.ContentScaling());
                idata.set(key,
                    {
                        pathData: value.pathData.map(val => {
                            let tVal = this.props.getTransform().inverse().transformPoint(val.x, val.y);
                            return { x: tVal[0], y: tVal[1] };
                            // return { x: val.x + centerShiftX, y: val.y + centerShiftY }
                        }),
                        color: value.color,
                        width: value.width,
                        tool: value.tool,
                        page: -1
                    });
            }
        });
        // InkSelectDecorations.Instance.SetSelected(idata);
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
            let layoutDoc = Doc.Layout(doc);
            var x = NumCast(doc.x);
            var y = NumCast(doc.y);
            var w = NumCast(layoutDoc.width);
            var h = NumCast(layoutDoc.height);
            if (this.intersectRect({ left: x, top: y, width: w, height: h }, selRect)) {
                selection.push(doc);
            }
        });
        if (!selection.length && selectBackgrounds) {
            this.props.activeDocuments().filter(doc => doc.z === undefined).map(doc => {
                let layoutDoc = Doc.Layout(doc);
                var x = NumCast(doc.x);
                var y = NumCast(doc.y);
                var w = NumCast(layoutDoc.width);
                var h = NumCast(layoutDoc.height);
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
                let layoutDoc = Doc.Layout(doc);
                var x = NumCast(doc.x);
                var y = NumCast(doc.y);
                var w = NumCast(layoutDoc.width);
                var h = NumCast(layoutDoc.height);
                if (this.intersectRect({ left: x, top: y, width: w, height: h }, otherBounds)) {
                    selection.push(doc);
                }
            });
        }
        return selection;
    }

    @computed
    get marqueeDiv() {
        let p: [number, number] = this._visible ? this.props.getContainerTransform().transformPoint(this._downX < this._lastX ? this._downX : this._lastX, this._downY < this._lastY ? this._downY : this._lastY) : [0, 0];
        let v = this.props.getContainerTransform().transformDirection(this._lastX - this._downX, this._lastY - this._downY);
        /**
         * @RE - The commented out span below
         * This contains the "C for collection, ..." text on marquees.
         * Commented out by syip2 when the marquee menu was added.
         */
        return <div className="marquee" style={{ transform: `translate(${p[0]}px, ${p[1]}px)`, width: `${Math.abs(v[0])}`, height: `${Math.abs(v[1])}`, zIndex: 2000 }} >
            {/* <span className="marquee-legend" /> */}
        </div>;
    }

    render() {
        return <div className="marqueeView" onScroll={(e) => e.currentTarget.scrollTop = e.currentTarget.scrollLeft = 0} style={{ borderRadius: "inherit" }} onClick={this.onClick} onPointerDown={this.onPointerDown}>
            {this._visible ? this.marqueeDiv : null}
            {this.props.children}
        </div>;
    }
}