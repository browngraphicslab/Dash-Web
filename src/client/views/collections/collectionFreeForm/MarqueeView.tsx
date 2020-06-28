import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, Opt, DocListCast, DataSym } from "../../../../fields/Doc";
import { InkData, InkField, InkTool } from "../../../../fields/InkField";
import { List } from "../../../../fields/List";
import { RichTextField } from "../../../../fields/RichTextField";
import { SchemaHeaderField } from "../../../../fields/SchemaHeaderField";
import { Cast, FieldValue, NumCast, StrCast } from "../../../../fields/Types";
import { Utils } from "../../../../Utils";
import { CognitiveServices } from "../../../cognitive_services/CognitiveServices";
import { Docs, DocumentOptions, DocUtils } from "../../../documents/Documents";
import { SelectionManager } from "../../../util/SelectionManager";
import { Transform } from "../../../util/Transform";
import { undoBatch } from "../../../util/UndoManager";
import { ContextMenu } from "../../ContextMenu";
import { FormattedTextBox } from "../../nodes/formattedText/FormattedTextBox";
import { PreviewCursor } from "../../PreviewCursor";
import { SubCollectionViewProps } from "../CollectionSubView";
import { CollectionView } from "../CollectionView";
import MarqueeOptionsMenu from "./MarqueeOptionsMenu";
import "./MarqueeView.scss";
import React = require("react");

interface MarqueeViewProps {
    getContainerTransform: () => Transform;
    getTransform: () => Transform;
    activeDocuments: () => Doc[];
    selectDocuments: (docs: Doc[]) => void;
    addLiveTextDocument: (doc: Doc) => void;
    isSelected: () => boolean;
    nudge: (x: number, y: number) => boolean;
    setPreviewCursor?: (func: (x: number, y: number, drag: boolean) => void) => void;
}

@observer
export class MarqueeView extends React.Component<SubCollectionViewProps & MarqueeViewProps>
{
    @observable public static DragMarquee = false;
    @observable _lastX: number = 0;
    @observable _lastY: number = 0;
    @observable _downX: number = 0;
    @observable _downY: number = 0;
    @observable _visible: boolean = false;
    _commandExecuted = false;
    @observable _pointsX: number[] = [];
    @observable _pointsY: number[] = [];
    @observable _freeHand: boolean = false;

    componentDidMount() {
        this.props.setPreviewCursor?.(this.setPreviewCursor);
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
        this._pointsX = [];
        this._pointsY = [];
    }

    @undoBatch
    @action
    onKeyPress = (e: KeyboardEvent) => {
        //make textbox and add it to this collection
        // tslint:disable-next-line:prefer-const
        let [x, y] = this.props.getTransform().transformPoint(this._downX, this._downY);
        if (e.key === "?") {
            ContextMenu.Instance.setDefaultItem("?", (str: string) => {
                const textDoc = Docs.Create.WebDocument(`https://bing.com/search?q=${str}`, {
                    _width: 200, x, y, _nativeHeight: 962, _nativeWidth: 800, isAnnotating: false,
                    title: "bing", UseCors: true
                });
                this.props.addDocTab(textDoc, "onRight");
            });

            ContextMenu.Instance.displayMenu(this._downX, this._downY);
            e.stopPropagation();
        } else
            if (e.key === ":") {
                DocUtils.addDocumentCreatorMenuItems(this.props.addLiveTextDocument, this.props.addDocument, x, y);

                ContextMenu.Instance.displayMenu(this._downX, this._downY);
                e.stopPropagation();
            } else if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.props.selectDocuments(this.props.activeDocuments());
                e.stopPropagation();
            } else if (e.key === "q" && e.ctrlKey) {
                e.preventDefault();
                (async () => {
                    const text: string = await navigator.clipboard.readText();
                    const ns = text.split("\n").filter(t => t.trim() !== "\r" && t.trim() !== "");
                    for (let i = 0; i < ns.length - 1; i++) {
                        while (!(ns[i].trim() === "" || ns[i].endsWith("-\r") || ns[i].endsWith("-") ||
                            ns[i].endsWith(";\r") || ns[i].endsWith(";") ||
                            ns[i].endsWith(".\r") || ns[i].endsWith(".") ||
                            ns[i].endsWith(":\r") || ns[i].endsWith(":")) && i < ns.length - 1) {
                            const sub = ns[i].endsWith("\r") ? 1 : 0;
                            const br = ns[i + 1].trim() === "";
                            ns.splice(i, 2, ns[i].substr(0, ns[i].length - sub) + ns[i + 1].trimLeft());
                            if (br) break;
                        }
                    }
                    ns.map(line => {
                        const indent = line.search(/\S|$/);
                        const newBox = Docs.Create.TextDocument(line, { _width: 200, _height: 35, x: x + indent / 3 * 10, y: y, title: line });
                        this.props.addDocument(newBox);
                        y += 40 * this.props.getTransform().Scale;
                    });
                })();
                e.stopPropagation();
            } else if (e.key === "b" && e.ctrlKey) {
                e.preventDefault();
                navigator.clipboard.readText().then(text => {
                    const ns = text.split("\n").filter(t => t.trim() !== "\r" && t.trim() !== "");
                    if (ns.length === 1 && text.startsWith("http")) {
                        this.props.addDocument(Docs.Create.ImageDocument(text, { _nativeWidth: 300, _width: 300, x: x, y: y }));// paste an image from its URL in the paste buffer
                    } else {
                        this.pasteTable(ns, x, y);
                    }
                });
                e.stopPropagation();
            } else if (!e.ctrlKey && !e.metaKey) {
                FormattedTextBox.SelectOnLoadChar = FormattedTextBox.DefaultLayout ? e.key : "";
                const tbox = Docs.Create.TextDocument("", {
                    _width: 200, _height: 100, x: x, y: y, _autoHeight: true, _fontSize: NumCast(Doc.UserDoc().fontSize),
                    _fontFamily: StrCast(Doc.UserDoc().fontFamily),
                    title: "-typed text-"
                });
                const template = FormattedTextBox.DefaultLayout;
                if (template instanceof Doc) {
                    tbox._width = NumCast(template._width);
                    tbox.layoutKey = "layout_" + StrCast(template.title);
                    Doc.GetProto(tbox)[StrCast(tbox.layoutKey)] = template;
                }
                this.props.addLiveTextDocument(tbox);
                e.stopPropagation();
            }
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
            const columns = ns[0].split("\t");
            const docList: Doc[] = [];
            let groupAttr: string | number = "";
            const rowProto = new Doc();
            rowProto.title = rowProto.Id;
            rowProto._width = 200;
            rowProto.isPrototype = true;
            for (let i = 1; i < ns.length - 1; i++) {
                const values = ns[i].split("\t");
                if (values.length === 1 && columns.length > 1) {
                    groupAttr = values[0];
                    continue;
                }
                const docDataProto = Doc.MakeDelegate(rowProto);
                docDataProto.isPrototype = true;
                columns.forEach((col, i) => docDataProto[columns[i]] = (values.length > i ? ((values[i].indexOf(Number(values[i]).toString()) !== -1) ? Number(values[i]) : values[i]) : undefined));
                if (groupAttr) {
                    docDataProto._group = groupAttr;
                }
                docDataProto.title = i.toString();
                const doc = Doc.MakeDelegate(docDataProto);
                doc._width = 200;
                docList.push(doc);
            }
            const newCol = Docs.Create.SchemaDocument([...(groupAttr ? [new SchemaHeaderField("_group", "#f1efeb")] : []), ...columns.filter(c => c).map(c => new SchemaHeaderField(c, "#f1efeb"))], docList, { x: x, y: y, title: "droppedTable", _width: 300, _height: 100 });

            this.props.addDocument(newCol);
        }
    }
    @action
    onPointerDown = (e: React.PointerEvent): void => {
        this._downX = this._lastX = e.clientX;
        this._downY = this._lastY = e.clientY;
        // allow marquee if right click OR alt+left click OR space bar + left click
        if (e.button === 2 || (e.button === 0 && (e.altKey || (MarqueeView.DragMarquee && this.props.active(true))))) {
            // if (e.altKey || (MarqueeView.DragMarquee && this.props.active(true))) {
            this.setPreviewCursor(e.clientX, e.clientY, true);
            // (!e.altKey) && e.stopPropagation(); // bcz: removed so that you can alt-click on button in a collection to switch link following behaviors.
            e.preventDefault();
            // }
            // bcz: do we need this?   it kills the context menu on the main collection if !altKey
            // e.stopPropagation();
        }
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        this._lastX = e.pageX;
        this._lastY = e.pageY;
        this._pointsX.push(e.clientX);
        this._pointsY.push(e.clientY);
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
        if (e.altKey || MarqueeView.DragMarquee) {
            e.preventDefault();
        }
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        if (this._visible) {
            const mselect = this.marqueeSelect();
            if (!e.shiftKey) {
                SelectionManager.DeselectAll(mselect.length ? undefined : this.props.Document);
            }
            // let inkselect = this.ink ? this.marqueeInkSelect(this.ink.inkData) : new Map();
            // let inks = inkselect.size ? [{ Document: this.inkDoc, Ink: inkselect }] : [];
            const docs = mselect.length ? mselect : [this.props.Document];
            this.props.selectDocuments(docs);
        }
        const hideMarquee = () => {
            this.hideMarquee();
            MarqueeOptionsMenu.Instance.fadeOut(true);
            document.removeEventListener("pointerdown", hideMarquee);
        };
        if (!this._commandExecuted && (Math.abs(this.Bounds.height * this.Bounds.width) > 100)) {
            MarqueeOptionsMenu.Instance.createCollection = this.collection;
            MarqueeOptionsMenu.Instance.delete = this.delete;
            MarqueeOptionsMenu.Instance.summarize = this.summary;
            MarqueeOptionsMenu.Instance.inkToText = this.syntaxHighlight;
            MarqueeOptionsMenu.Instance.showMarquee = this.showMarquee;
            MarqueeOptionsMenu.Instance.hideMarquee = this.hideMarquee;
            MarqueeOptionsMenu.Instance.jumpTo(e.clientX, e.clientY);
            document.addEventListener("pointerdown", hideMarquee);
        } else {
            this.hideMarquee();
        }
        this.cleanupInteractions(true, this._commandExecuted);

        if (e.altKey || MarqueeView.DragMarquee) {
            e.preventDefault();
        }
    }
    clearSelection() {
        if (window.getSelection) { window.getSelection()?.removeAllRanges(); }
        else if (document.getSelection()) { document.getSelection()?.empty(); }
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
            PreviewCursor.Show(x, y, this.onKeyPress, this.props.addLiveTextDocument, this.props.getTransform, this.props.addDocument, this.props.nudge);
            this.clearSelection();
        }
    });

    @action
    onClick = (e: React.MouseEvent): void => {
        if (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD &&
            Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD) {
            if (Doc.GetSelectedTool() === InkTool.None) {
                !(e.nativeEvent as any).formattedHandled && this.setPreviewCursor(e.clientX, e.clientY, false);
            }
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
        const left = this._downX < this._lastX ? this._downX : this._lastX;
        const top = this._downY < this._lastY ? this._downY : this._lastY;
        const topLeft = this.props.getTransform().transformPoint(left, top);
        const size = this.props.getTransform().transformDirection(this._lastX - this._downX, this._lastY - this._downY);
        return { left: topLeft[0], top: topLeft[1], width: Math.abs(size[0]), height: Math.abs(size[1]) };
    }

    get inkDoc() {
        return this.props.Document;
    }

    get ink() { // ink will be stored on the extension doc for the field (fieldKey) where the container's data is stored.
        return Cast(this.props.Document.ink, InkField);
    }

    set ink(value: InkField | undefined) {
        this.props.Document.ink = value;
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
        this.props.removeDocument(this.marqueeSelect(false));
        SelectionManager.DeselectAll();
        this.cleanupInteractions(false);
        MarqueeOptionsMenu.Instance.fadeOut(true);
        this.hideMarquee();
    }

    getCollection = (selected: Doc[], creator: Opt<(documents: Array<Doc>, options: DocumentOptions, id?: string) => Doc>, isBackground?: boolean) => {
        const bounds = this.Bounds;
        // const inkData = this.ink ? this.ink.inkData : undefined;
        const newCollection = (creator || Docs.Create.FreeformDocument)(selected, {
            x: bounds.left,
            y: bounds.top,
            _panX: 0,
            _panY: 0,
            isBackground,
            backgroundColor: this.props.isAnnotationOverlay ? "#00000015" : isBackground ? "cyan" : undefined,
            _width: bounds.width,
            _height: bounds.height,
            _LODdisable: true,
            title: "a nested collection",
        });
        selected.forEach(d => d.context = newCollection);
        this.hideMarquee();
        return newCollection;
    }

    @action
    pileup = (e: KeyboardEvent | React.PointerEvent | undefined) => {
        const selected = this.marqueeSelect(false);
        SelectionManager.DeselectAll();
        selected.forEach(d => this.props.removeDocument(d));
        const newCollection = DocUtils.pileup(selected, this.Bounds.left + this.Bounds.width / 2, this.Bounds.top + this.Bounds.height / 2);
        this.props.addDocument(newCollection!);
        this.props.selectDocuments([newCollection!]);
        MarqueeOptionsMenu.Instance.fadeOut(true);
        this.hideMarquee();
    }

    @action
    collection = (e: KeyboardEvent | React.PointerEvent | undefined) => {
        const bounds = this.Bounds;
        const selected = this.marqueeSelect(false);
        if (e instanceof KeyboardEvent ? e.key === "c" : true) {
            selected.map(action(d => {
                const dx = NumCast(d.x);
                const dy = NumCast(d.y);
                delete d.x;
                delete d.y;
                delete d.activeFrame;
                delete d.displayTimecode;  // bcz: this should be automatic somehow.. along with any other properties that were logically associated with the original collection
                d.x = dx - bounds.left - bounds.width / 2;
                d.y = dy - bounds.top - bounds.height / 2;
                return d;
            }));
            this.props.removeDocument(selected);
        }
        const newCollection = this.getCollection(selected, (e as KeyboardEvent)?.key === "t" ? Docs.Create.StackingDocument : undefined);
        this.props.addDocument(newCollection);
        this.props.selectDocuments([newCollection]);
        MarqueeOptionsMenu.Instance.fadeOut(true);
        this.hideMarquee();
    }

    @action
    syntaxHighlight = (e: KeyboardEvent | React.PointerEvent | undefined) => {
        const selected = this.marqueeSelect(false);
        if (e instanceof KeyboardEvent ? e.key === "i" : true) {
            const inks = selected.filter(s => s.proto?.type === "ink");
            const setDocs = selected.filter(s => s.proto?.type === "text" && s.color);
            const sets = setDocs.map((sd) => {
                return Cast(sd.data, RichTextField)?.Text as string;
            });
            const colors = setDocs.map(sd => FieldValue(sd.color) as string);
            const wordToColor = new Map<string, string>();
            sets.forEach((st: string, i: number) => {
                const words = st.split(",");
                words.forEach(word => {
                    wordToColor.set(word, colors[i]);
                });
            });
            const strokes: InkData[] = [];
            inks.forEach(i => {
                const d = Cast(i.data, InkField);
                const x = NumCast(i.x);
                const y = NumCast(i.y);
                const left = Math.min(...d?.inkData.map(pd => pd.X) ?? [0]);
                const top = Math.min(...d?.inkData.map(pd => pd.Y) ?? [0]);
                if (d) {
                    strokes.push(d.inkData.map(pd => ({ X: pd.X + x - left, Y: pd.Y + y - top })));
                }
            });
            CognitiveServices.Inking.Appliers.InterpretStrokes(strokes).then((results) => {
                // const wordResults = results.filter((r: any) => r.category === "inkWord");
                // console.log(wordResults);
                // console.log(results);
                // for (const word of wordResults) {
                //     const indices: number[] = word.strokeIds;
                //     indices.forEach(i => {
                //         if (wordToColor.has(word.recognizedText.toLowerCase())) {
                //             inks[i].color = wordToColor.get(word.recognizedText.toLowerCase());
                //         }
                //         else {
                //             for (const alt of word.alternates) {
                //                 if (wordToColor.has(alt.recognizedString.toLowerCase())) {
                //                     inks[i].color = wordToColor.get(alt.recognizedString.toLowerCase());
                //                     break;
                //                 }
                //             }
                //         }
                //     })
                // }
                // const wordResults = results.filter((r: any) => r.category === "inkWord");
                // for (const word of wordResults) {
                //     const indices: number[] = word.strokeIds;
                //     indices.forEach(i => {
                //         const otherInks: Doc[] = [];
                //         indices.forEach(i2 => i2 !== i && otherInks.push(inks[i2]));
                //         inks[i].relatedInks = new List<Doc>(otherInks);
                //         const uniqueColors: string[] = [];
                //         Array.from(wordToColor.values()).forEach(c => uniqueColors.indexOf(c) === -1 && uniqueColors.push(c));
                //         inks[i].alternativeColors = new List<string>(uniqueColors);
                //         if (wordToColor.has(word.recognizedText.toLowerCase())) {
                //             inks[i].color = wordToColor.get(word.recognizedText.toLowerCase());
                //         }
                //         else if (word.alternates) {
                //             for (const alt of word.alternates) {
                //                 if (wordToColor.has(alt.recognizedString.toLowerCase())) {
                //                     inks[i].color = wordToColor.get(alt.recognizedString.toLowerCase());
                //                     break;
                //                 }
                //             }
                //         }
                //     });
                // }
                const lines = results.filter((r: any) => r.category === "line");
                console.log(lines);
                const text = lines.map((l: any) => l.recognizedText).join("\r\n");
                this.props.addDocument(Docs.Create.TextDocument(text, { _width: this.Bounds.width, _height: this.Bounds.height, x: this.Bounds.left + this.Bounds.width, y: this.Bounds.top, title: text }));
            });
        }
    }

    @action
    summary = (e: KeyboardEvent | React.PointerEvent | undefined) => {
        const bounds = this.Bounds;
        const selected = this.marqueeSelect(false);
        selected.map(d => {
            this.props.removeDocument(d);
            d.x = NumCast(d.x) - bounds.left - bounds.width / 2;
            d.y = NumCast(d.y) - bounds.top - bounds.height / 2;
            d.page = -1;
            return d;
        });
        const summary = Docs.Create.TextDocument("", { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2, _width: 200, _height: 200, _fitToBox: true, _showSidebar: true, title: "overview" });
        const portal = Doc.MakeAlias(summary);
        Doc.GetProto(summary)[Doc.LayoutFieldKey(summary) + "-annotations"] = new List<Doc>(selected);
        Doc.GetProto(summary).layout_portal = CollectionView.LayoutString(Doc.LayoutFieldKey(summary) + "-annotations");
        summary._backgroundColor = "#e2ad32";
        portal.layoutKey = "layout_portal";
        portal.title = "document collection";
        DocUtils.MakeLink({ doc: summary }, { doc: portal }, "summarizing");

        this.props.addLiveTextDocument(summary);
        MarqueeOptionsMenu.Instance.fadeOut(true);
    }
    @action
    background = (e: KeyboardEvent | React.PointerEvent | undefined) => {
        const newCollection = this.getCollection([], undefined, true);
        this.props.addDocument(newCollection);
        MarqueeOptionsMenu.Instance.fadeOut(true);
        this.hideMarquee();
        setTimeout(() => this.props.selectDocuments([newCollection]), 0);
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
        if (e.key === "c" || e.key === "b" || e.key === "t" || e.key === "s" || e.key === "S" || e.key === "p") {
            this._commandExecuted = true;
            e.stopPropagation();
            e.preventDefault();
            (e as any).propagationIsStopped = true;
            if (e.key === "c" || e.key === "t") {
                this.collection(e);
            }
            if (e.key === "s" || e.key === "S") {
                this.summary(e);
            }
            if (e.key === "b") {
                this.background(e);
            }
            if (e.key === "p") {
                this.pileup(e);
            }
            this.cleanupInteractions(false);
        }
        if (e.key === "r" || e.key === " ") {
            this._commandExecuted = true;
            e.stopPropagation();
            e.preventDefault();
            this.changeFreeHand(true);
        }
    }

    @action
    changeFreeHand = (x: boolean) => {
        this._freeHand = !this._freeHand;
    }
    // @action
    // marqueeInkSelect(ink: Map<any, any>) {
    //     let idata = new Map();
    //     let centerShiftX = 0 - (this.Bounds.left + this.Bounds.width / 2); // moves each point by the offset that shifts the selection's center to the origin.
    //     let centerShiftY = 0 - (this.Bounds.top + this.Bounds.height / 2);
    //     ink.forEach((value: PointData, key: string, map: any) => {
    //         if (InkingCanvas.IntersectStrokeRect(value, this.Bounds)) {
    //             // let transform = this.props.container.props.ScreenToLocalTransform().scale(this.props.container.props.ContentScaling());
    //             idata.set(key,
    //                 {
    //                     pathData: value.pathData.map(val => {
    //                         let tVal = this.props.getTransform().inverse().transformPoint(val.x, val.y);
    //                         return { x: tVal[0], y: tVal[1] };
    //                         // return { x: val.x + centerShiftX, y: val.y + centerShiftY }
    //                     }),
    //                     color: value.color,
    //                     width: value.width,
    //                     tool: value.tool,
    //                     page: -1
    //                 });
    //         }
    //     });
    //     // InkSelectDecorations.Instance.SetSelected(idata);
    //     return idata;
    // }

    // @action
    // marqueeInkDelete(ink?: Map<any, any>) {
    //     // bcz: this appears to work but when you restart all the deleted strokes come back -- InkField isn't observing its changes so they aren't written to the DB.
    //     // ink.forEach((value: StrokeData, key: string, map: any) =>
    //     //     InkingCanvas.IntersectStrokeRect(value, this.Bounds) && ink.delete(key));

    //     if (ink) {
    //         let idata = new Map();
    //         ink.forEach((value: PointData, key: string, map: any) =>
    //             !InkingCanvas.IntersectStrokeRect(value, this.Bounds) && idata.set(key, value));
    //         this.ink = new InkField(idata);
    //     }
    // }
    touchesLine(r1: { left: number, top: number, width: number, height: number }) {
        for (var i = 0; i < this._pointsX.length; i++) {
            const topLeft = this.props.getTransform().transformPoint(this._pointsX[i], this._pointsY[i]);
            if (topLeft[0] > r1.left &&
                topLeft[0] < r1.left + r1.width &&
                topLeft[1] > r1.top &&
                topLeft[1] < r1.top + r1.height) {
                return true;
            }
        }
        return false;
    }

    boundingShape(r1: { left: number, top: number, width: number, height: number }) {
        const trueLeft = this.props.getTransform().transformPoint(Math.min(...this._pointsX), Math.min(...this._pointsY))[0];
        const trueTop = this.props.getTransform().transformPoint(Math.min(...this._pointsX), Math.min(...this._pointsY))[1];
        const trueRight = this.props.getTransform().transformPoint(Math.max(...this._pointsX), Math.max(...this._pointsY))[0];
        const trueBottom = this.props.getTransform().transformPoint(Math.max(...this._pointsX), Math.max(...this._pointsY))[1];

        if (r1.left > trueLeft && r1.top > trueTop && r1.left + r1.width < trueRight && r1.top + r1.height < trueBottom) {
            var hasTop = false;
            var hasLeft = false;
            var hasBottom = false;
            var hasRight = false;
            for (var i = 0; i < this._pointsX.length; i++) {
                const truePoint = this.props.getTransform().transformPoint(this._pointsX[i], this._pointsY[i]);
                if (!hasLeft && (truePoint[0] > trueLeft && truePoint[0] < r1.left) && (truePoint[1] > r1.top && truePoint[1] < r1.top + r1.height)) {
                    hasLeft = true;
                }
                if (!hasTop && (truePoint[1] > trueTop && truePoint[1] < r1.top) && (truePoint[0] > r1.left && truePoint[0] < r1.left + r1.width)) {
                    hasTop = true;
                }
                if (!hasRight && (truePoint[0] < trueRight && truePoint[0] > r1.left + r1.width) && (truePoint[1] > r1.top && truePoint[1] < r1.top + r1.height)) {
                    hasRight = true;
                }
                if (!hasBottom && (truePoint[1] < trueBottom && truePoint[1] > r1.top + r1.height) && (truePoint[0] > r1.left && truePoint[0] < r1.left + r1.width)) {
                    hasBottom = true;
                }
                if (hasTop && hasLeft && hasBottom && hasRight) {
                    return true;
                }
            }
        }
        return false;
    }
    marqueeSelect(selectBackgrounds: boolean = true) {
        const selRect = this.Bounds;
        const selection: Doc[] = [];
        this.props.activeDocuments().filter(doc => !doc.isBackground && !doc.z).map(doc => {
            const layoutDoc = Doc.Layout(doc);
            const x = NumCast(doc.x);
            const y = NumCast(doc.y);
            const w = NumCast(layoutDoc._width);
            const h = NumCast(layoutDoc._height);
            if (this._freeHand === false) {
                if (this.intersectRect({ left: x, top: y, width: w, height: h }, selRect)) {
                    selection.push(doc);
                }
            } else {
                if (this.touchesLine({ left: x, top: y, width: w, height: h }) ||
                    this.boundingShape({ left: x, top: y, width: w, height: h })) {
                    selection.push(doc);
                }
            }
        });
        if (!selection.length && selectBackgrounds) {
            this.props.activeDocuments().filter(doc => doc.z === undefined).map(doc => {
                const layoutDoc = Doc.Layout(doc);
                const x = NumCast(doc.x);
                const y = NumCast(doc.y);
                const w = NumCast(layoutDoc._width);
                const h = NumCast(layoutDoc._height);
                if (this.intersectRect({ left: x, top: y, width: w, height: h }, selRect)) {
                    selection.push(doc);
                }
            });
        }
        if (!selection.length) {
            const left = this._downX < this._lastX ? this._downX : this._lastX;
            const top = this._downY < this._lastY ? this._downY : this._lastY;
            const topLeft = this.props.getContainerTransform().transformPoint(left, top);
            const size = this.props.getContainerTransform().transformDirection(this._lastX - this._downX, this._lastY - this._downY);
            const otherBounds = { left: topLeft[0], top: topLeft[1], width: Math.abs(size[0]), height: Math.abs(size[1]) };
            this.props.activeDocuments().filter(doc => doc.z !== undefined).map(doc => {
                const layoutDoc = Doc.Layout(doc);
                const x = NumCast(doc.x);
                const y = NumCast(doc.y);
                const w = NumCast(layoutDoc._width);
                const h = NumCast(layoutDoc._height);
                if (this._freeHand === false) {
                    if (this.intersectRect({ left: x, top: y, width: w, height: h }, selRect)) {
                        selection.push(doc);
                    }
                } else {
                    if (this.touchesLine({ left: x, top: y, width: w, height: h }) ||
                        this.boundingShape({ left: x, top: y, width: w, height: h })) {
                        selection.push(doc);
                    }
                }
            });
        }
        return selection;
    }

    @computed
    get marqueeDiv() {
        const p = this._visible ? this.props.getContainerTransform().transformPoint(this._downX < this._lastX ? this._downX : this._lastX, this._downY < this._lastY ? this._downY : this._lastY) : [0, 0];
        const v = this.props.getContainerTransform().transformDirection(this._lastX - this._downX, this._lastY - this._downY);
        /**
         * @RE - The commented out span below
         * This contains the "C for collection, ..." text on marquees.
         * Commented out by syip2 when the marquee menu was added.
         */
        if (!this._freeHand) {
            return <div className="marquee" style={{
                transform: `translate(${p[0]}px, ${p[1]}px)`,
                width: `${Math.abs(v[0])}`,
                height: `${Math.abs(v[1])}`, zIndex: 2000
            }} >
                <span className="marquee-legend"></span>
            </div>;

        } else {
            //subtracted 250 for offset
            var str: string = "";
            for (var i = 0; i < this._pointsX.length; i++) {
                var x = 0;
                x = this._pointsX[i] - 250;
                str += x.toString();
                str += ",";
                str += this._pointsY[i].toString();
                str += (" ");
            }

            //hardcoded height and width.
            return <div className="marquee" style={{ zIndex: 2000 }}>
                <svg height={2000} width={2000}>
                    <polyline
                        points={str}
                        fill="none"
                        stroke="black"
                        strokeWidth="1"
                        strokeDasharray="3"
                    />
                </svg>
            </div>;
        }
    }

    render() {
        return <div className="marqueeView"
            style={{ overflow: StrCast(this.props.Document._overflow), cursor: MarqueeView.DragMarquee && this ? "crosshair" : "hand" }}
            onDragOver={e => e.preventDefault()}
            onScroll={(e) => e.currentTarget.scrollTop = e.currentTarget.scrollLeft = 0} onClick={this.onClick} onPointerDown={this.onPointerDown}>
            {this._visible ? this.marqueeDiv : null}
            {this.props.children}
        </div>;
    }
}