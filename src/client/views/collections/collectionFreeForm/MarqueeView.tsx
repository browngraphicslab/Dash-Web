import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { AclAddonly, AclAdmin, AclEdit, DataSym, Doc, Opt } from "../../../../fields/Doc";
import { Id } from "../../../../fields/FieldSymbols";
import { InkData, InkField, InkTool } from "../../../../fields/InkField";
import { List } from "../../../../fields/List";
import { RichTextField } from "../../../../fields/RichTextField";
import { SchemaHeaderField } from "../../../../fields/SchemaHeaderField";
import { Cast, FieldValue, NumCast, StrCast } from "../../../../fields/Types";
import { GetEffectiveAcl } from "../../../../fields/util";
import { Utils, intersectRect, returnFalse } from "../../../../Utils";
import { CognitiveServices } from "../../../cognitive_services/CognitiveServices";
import { Docs, DocumentOptions, DocUtils } from "../../../documents/Documents";
import { DocumentType } from "../../../documents/DocumentTypes";
import { CurrentUserUtils } from "../../../util/CurrentUserUtils";
import { DocumentManager } from "../../../util/DocumentManager";
import { SelectionManager } from "../../../util/SelectionManager";
import { Transform } from "../../../util/Transform";
import { undoBatch, UndoManager } from "../../../util/UndoManager";
import { ContextMenu } from "../../ContextMenu";
import { FormattedTextBox } from "../../nodes/formattedText/FormattedTextBox";
import { PresBox, PresMovement } from "../../nodes/PresBox";
import { PreviewCursor } from "../../PreviewCursor";
import { CollectionDockingView } from "../CollectionDockingView";
import { SubCollectionViewProps } from "../CollectionSubView";
import { CollectionView } from "../CollectionView";
import { MarqueeOptionsMenu } from "./MarqueeOptionsMenu";
import "./MarqueeView.scss";
import React = require("react");
import { StyleLayers } from "../../StyleProvider";

interface MarqueeViewProps {
    getContainerTransform: () => Transform;
    getTransform: () => Transform;
    activeDocuments: () => Doc[];
    selectDocuments: (docs: Doc[]) => void;
    addLiveTextDocument: (doc: Doc) => void;
    isSelected: () => boolean;
    trySelectCluster: (addToSel: boolean) => boolean;
    nudge?: (x: number, y: number) => boolean;
    ungroup?: () => void;
    setPreviewCursor?: (func: (x: number, y: number, drag: boolean) => void) => void;
}
@observer
export class MarqueeView extends React.Component<SubCollectionViewProps & MarqueeViewProps>
{
    private _commandExecuted = false;
    @observable public static DragMarquee = false;
    @observable _lastX: number = 0;
    @observable _lastY: number = 0;
    @observable _downX: number = 0;
    @observable _downY: number = 0;
    @observable _visible: boolean = false;
    @observable _lassoPts: [number, number][] = [];
    @observable _lassoFreehand: boolean = false;

    @computed get Transform() { return this.props.getTransform(); }
    @computed get Bounds() {
        const topLeft = this.Transform.transformPoint(this._downX < this._lastX ? this._downX : this._lastX, this._downY < this._lastY ? this._downY : this._lastY);
        const size = this.Transform.transformDirection(this._lastX - this._downX, this._lastY - this._downY);
        return { left: topLeft[0], top: topLeft[1], width: Math.abs(size[0]), height: Math.abs(size[1]) };
    }
    get inkDoc() { return this.props.Document; }
    get ink() { return Cast(this.props.Document.ink, InkField); }
    set ink(value: Opt<InkField>) { this.props.Document.ink = value; }

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
        hideMarquee && this.hideMarquee();

        this._lassoPts = [];
    }

    @undoBatch
    @action
    onKeyPress = (e: KeyboardEvent) => {
        //make textbox and add it to this collection
        // tslint:disable-next-line:prefer-const
        const cm = ContextMenu.Instance;
        const [x, y] = this.Transform.transformPoint(this._downX, this._downY);
        if (e.key === "?") {
            cm.setDefaultItem("?", (str: string) => this.props.addDocTab(
                Docs.Create.WebDocument(`https://bing.com/search?q=${str}`, { _width: 400, x, y, _height: 512, _nativeWidth: 850, isAnnotating: false, title: "bing", useCors: true }), "add:right"));

            cm.displayMenu(this._downX, this._downY);
            e.stopPropagation();
        } else
            if (e.key === "u" && this.props.ungroup) {
                e.stopPropagation();
                this.props.ungroup();
            }
            else if (e.key === ":") {
                DocUtils.addDocumentCreatorMenuItems(this.props.addLiveTextDocument, this.props.addDocument || returnFalse, x, y);

                cm.displayMenu(this._downX, this._downY);
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
                    let ypos = y;
                    ns.map(line => {
                        const indent = line.search(/\S|$/);
                        const newBox = Docs.Create.TextDocument(line, { _width: 200, _height: 35, x: x + indent / 3 * 10, y: ypos, title: line });
                        this.props.addDocument?.(newBox);
                        ypos += 40 * this.Transform.Scale;
                    });
                })();
                e.stopPropagation();
            } else if (e.key === "f" && e.ctrlKey) {
                e.preventDefault();
                const root = Docs.Create.TreeDocument([], { title: "folder", _stayInCollection: true, isFolder: true });
                const folder = Docs.Create.TreeDocument([root], { title: "root", isFolder: true, treeViewType: "fileSystem", treeViewTruncateTitleWidth: 150 });
                Doc.GetProto(folder).isFolder = true;
                folder.x = x;
                folder.y = y;
                folder._width = 200;
                folder._height = 300;
                this.props.addDocument?.(folder);
                //setTimeout(() => SelectionManager.SelectDoc(DocumentManager.Instance.getDocumentView(slide)!, false));
                e.stopPropagation();
            } else if (e.key === "b" && e.ctrlKey) {
                // e.preventDefault();
                // navigator.clipboard.readText().then(text => {
                //     const ns = text.split("\n").filter(t => t.trim() !== "\r" && t.trim() !== "");
                //     if (ns.length === 1 && text.startsWith("http")) {
                //         this.props.addDocument(Docs.Create.ImageDocument(text, { _nativeWidth: 300, _width: 300, x: x, y: y }));// paste an image from its URL in the paste buffer
                //     } else {
                //         this.pasteTable(ns, x, y);
                //     }
                // });
                // e.stopPropagation();

                e.preventDefault();
                const slide = Doc.copyDragFactory(Doc.UserDoc().emptySlide as Doc)!;
                slide.x = x;
                slide.y = y;
                FormattedTextBox.SelectOnLoad = slide[Id];
                this.props.addDocument?.(slide);
                //setTimeout(() => SelectionManager.SelectDoc(DocumentManager.Instance.getDocumentView(slide)!, false));
                e.stopPropagation();
            } else if (!e.ctrlKey && !e.metaKey && SelectionManager.Views().length < 2) {
                FormattedTextBox.SelectOnLoadChar = FormattedTextBox.DefaultLayout && !this.props.childLayoutString ? e.key : "";
                FormattedTextBox.LiveTextUndo = UndoManager.StartBatch("live text batch");
                this.props.addLiveTextDocument(CurrentUserUtils.GetNewTextDoc("-typed text-", x, y, 200, 100, this.props.xMargin === 0));
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

            this.props.addDocument?.(newCol);
        }
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        this._downX = this._lastX = e.clientX;
        this._downY = this._lastY = e.clientY;
        if (!(e.nativeEvent as any).marqueeHit) {
            (e.nativeEvent as any).marqueeHit = true;
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
            else PreviewCursor.Visible = false;
        }
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        this._lastX = e.pageX;
        this._lastY = e.pageY;
        this._lassoPts.push([e.clientX, e.clientY]);
        if (!e.cancelBubble) {
            if (Math.abs(this._lastX - this._downX) > Utils.DRAG_THRESHOLD ||
                Math.abs(this._lastY - this._downY) > Utils.DRAG_THRESHOLD) {
                if (!this._commandExecuted) {
                    this.showMarquee();
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
            document.removeEventListener("wheel", hideMarquee);
        };
        if (!this._commandExecuted && (Math.abs(this.Bounds.height * this.Bounds.width) > 100)) {
            MarqueeOptionsMenu.Instance.createCollection = this.collection;
            MarqueeOptionsMenu.Instance.delete = this.delete;
            MarqueeOptionsMenu.Instance.summarize = this.summary;
            MarqueeOptionsMenu.Instance.inkToText = this.syntaxHighlight;
            MarqueeOptionsMenu.Instance.showMarquee = this.showMarquee;
            MarqueeOptionsMenu.Instance.hideMarquee = this.hideMarquee;
            MarqueeOptionsMenu.Instance.jumpTo(e.clientX, e.clientY);
            MarqueeOptionsMenu.Instance.pinWithView = this.pinWithView;
            document.addEventListener("pointerdown", hideMarquee);
            document.addEventListener("wheel", hideMarquee);
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
            const effectiveAcl = GetEffectiveAcl(this.props.Document[DataSym]);
            if ([AclAdmin, AclEdit, AclAddonly].includes(effectiveAcl)) {
                PreviewCursor.Show(x, y, this.onKeyPress, this.props.addLiveTextDocument, this.props.getTransform, this.props.addDocument, this.props.nudge);
            }
            this.clearSelection();
        }
    });

    @action
    onClick = (e: React.MouseEvent): void => {
        if (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD &&
            Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD) {
            if (Doc.GetSelectedTool() === InkTool.None) {
                if (!(e.nativeEvent as any).marqueeHit) {
                    (e.nativeEvent as any).marqueeHit = true;
                    if (!(e.nativeEvent as any).formattedHandled) {
                        if (!this.props.trySelectCluster(e.shiftKey)) {
                            this.setPreviewCursor(e.clientX, e.clientY, false);
                        } else e.stopPropagation();
                    }
                }
            }
            // let the DocumentView stopPropagation of this event when it selects this document
        } else {  // why do we get a click event when the cursor have moved a big distance?
            // let's cut it off here so no one else has to deal with it.
            e.stopPropagation();
        }
    }

    @action
    showMarquee = () => { this._visible = true; }

    @action
    hideMarquee = () => { this._visible = false; }

    @undoBatch
    @action
    delete = () => {
        const selected = this.marqueeSelect(false);
        SelectionManager.DeselectAll();
        selected.forEach(doc => this.props.removeDocument?.(doc));

        this.cleanupInteractions(false);
        MarqueeOptionsMenu.Instance.fadeOut(true);
        this.hideMarquee();
    }

    getCollection = action((selected: Doc[], creator: Opt<(documents: Array<Doc>, options: DocumentOptions, id?: string) => Doc>, layers: string[], makeGroup: Opt<boolean>) => {
        const newCollection = creator ? creator(selected, { title: "nested stack", }) : ((doc: Doc) => {
            Doc.GetProto(doc).data = new List<Doc>(selected);
            Doc.GetProto(doc).title = makeGroup ? "grouping" : "nested freeform";
            doc._panX = doc._panY = 0;
            return doc;
        })(Doc.MakeCopy(Doc.UserDoc().emptyCollection as Doc, true));
        newCollection.system = undefined;
        newCollection.layers = new List<string>(layers);
        newCollection._width = this.Bounds.width;
        newCollection._height = this.Bounds.height;
        newCollection._isGroup = makeGroup;
        newCollection.x = this.Bounds.left;
        newCollection.y = this.Bounds.top;
        selected.forEach(d => d.context = newCollection);
        this.hideMarquee();
        return newCollection;
    });

    @action
    pileup = (e: KeyboardEvent | React.PointerEvent | undefined) => {
        const selected = this.marqueeSelect(false);
        SelectionManager.DeselectAll();
        selected.forEach(d => this.props.removeDocument?.(d));
        const newCollection = DocUtils.pileup(selected, this.Bounds.left + this.Bounds.width / 2, this.Bounds.top + this.Bounds.height / 2);
        this.props.addDocument?.(newCollection!);
        this.props.selectDocuments([newCollection!]);
        MarqueeOptionsMenu.Instance.fadeOut(true);
        this.hideMarquee();
    }

    @undoBatch
    @action
    pinWithView = (e: KeyboardEvent | React.PointerEvent | undefined) => {
        const doc = this.props.Document;
        const curPres = Cast(Doc.UserDoc().activePresentation, Doc) as Doc;
        if (curPres) {
            if (doc === curPres) { alert("Cannot pin presentation document to itself"); return; }
            const pinDoc = Doc.MakeAlias(doc);
            pinDoc.presentationTargetDoc = doc;
            pinDoc.presMovement = PresMovement.Zoom;
            pinDoc.groupWithUp = false;
            pinDoc.context = curPres;
            pinDoc.title = doc.title + " - Slide";
            const presArray = PresBox.Instance?.sortArray();
            const size = PresBox.Instance?._selectedArray.size;
            const presSelected = presArray && size ? presArray[size - 1] : undefined;
            Doc.AddDocToList(curPres, "data", pinDoc, presSelected);
            if (curPres.expandBoolean) pinDoc.presExpandInlineButton = true;
            if (!DocumentManager.Instance.getDocumentView(curPres)) {
                CollectionDockingView.AddSplit(curPres, "right");
            }
            PresBox.Instance?._selectedArray.clear();
            pinDoc && PresBox.Instance?._selectedArray.set(pinDoc, undefined); //Updates selected array
            const index = PresBox.Instance?.childDocs.indexOf(pinDoc);
            index && (curPres._itemIndex = index);
            if (e instanceof KeyboardEvent ? e.key === "c" : true) {
                const scale = Math.min(this.props.PanelWidth() / this.Bounds.width, this.props.PanelHeight() / this.Bounds.height);
                pinDoc.presPinView = true;
                pinDoc.presPinViewX = this.Bounds.left + this.Bounds.width / 2;
                pinDoc.presPinViewY = this.Bounds.top + this.Bounds.height / 2;
                pinDoc.presPinViewScale = scale;
            }
        }
        MarqueeOptionsMenu.Instance.fadeOut(true);
        this.hideMarquee();
    }

    @undoBatch
    @action
    collection = (e: KeyboardEvent | React.PointerEvent | undefined, group?: boolean) => {
        const selected = this.marqueeSelect(false);
        if (e instanceof KeyboardEvent ? "cg".includes(e.key) : true) {
            selected.map(action(d => {
                const dx = NumCast(d.x);
                const dy = NumCast(d.y);
                delete d.x;
                delete d.y;
                delete d.activeFrame;
                delete d._timecodeToShow;  // bcz: this should be automatic somehow.. along with any other properties that were logically associated with the original collection
                delete d._timecodeToHide;  // bcz: this should be automatic somehow.. along with any other properties that were logically associated with the original collection
                d.x = dx - this.Bounds.left - this.Bounds.width / 2;
                d.y = dy - this.Bounds.top - this.Bounds.height / 2;
                return d;
            }));
            this.props.removeDocument?.(selected);
        }
        const newCollection = this.getCollection(selected, (e as KeyboardEvent)?.key === "t" ? Docs.Create.StackingDocument : undefined, [], group);
        this.props.addDocument?.(newCollection);
        this.props.selectDocuments([newCollection]);
        MarqueeOptionsMenu.Instance.fadeOut(true);
        this.hideMarquee();
    }

    @undoBatch
    @action
    syntaxHighlight = (e: KeyboardEvent | React.PointerEvent | undefined) => {
        const selected = this.marqueeSelect(false);
        if (e instanceof KeyboardEvent ? e.key === "i" : true) {
            const inks = selected.filter(s => s.proto?.type === DocumentType.INK);
            const setDocs = selected.filter(s => s.proto?.type === DocumentType.RTF && s.color);
            const sets = setDocs.map((sd) => Cast(sd.data, RichTextField)?.Text as string);
            const colors = setDocs.map(sd => FieldValue(sd.color) as string);
            const wordToColor = new Map<string, string>();
            sets.forEach((st: string, i: number) => st.split(",").forEach(word => wordToColor.set(word, colors[i])));
            const strokes: InkData[] = [];
            inks.filter(i => Cast(i.data, InkField)).forEach(i => {
                const d = Cast(i.data, InkField, null);
                const left = Math.min(...d?.inkData.map(pd => pd.X) ?? [0]);
                const top = Math.min(...d?.inkData.map(pd => pd.Y) ?? [0]);
                strokes.push(d.inkData.map(pd => ({ X: pd.X + NumCast(i.x) - left, Y: pd.Y + NumCast(i.y) - top })));
            });
            CognitiveServices.Inking.Appliers.InterpretStrokes(strokes).then((results) => {
                // const wordResults = results.filter((r: any) => r.category === "inkWord");
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
                const text = lines.map((l: any) => l.recognizedText).join("\r\n");
                this.props.addDocument?.(Docs.Create.TextDocument(text, { _width: this.Bounds.width, _height: this.Bounds.height, x: this.Bounds.left + this.Bounds.width, y: this.Bounds.top, title: text }));
            });
        }
    }

    @undoBatch
    @action
    summary = (e: KeyboardEvent | React.PointerEvent | undefined) => {
        const selected = this.marqueeSelect(false).map(d => {
            this.props.removeDocument?.(d);
            d.x = NumCast(d.x) - this.Bounds.left;
            d.y = NumCast(d.y) - this.Bounds.top;
            return d;
        });
        const summary = Docs.Create.TextDocument("", { x: this.Bounds.left, y: this.Bounds.top, _width: 200, _height: 200, _fitToBox: true, _showSidebar: true, title: "overview" });
        const portal = Doc.MakeAlias(summary);
        Doc.GetProto(summary)[Doc.LayoutFieldKey(summary) + "-annotations"] = new List<Doc>(selected);
        Doc.GetProto(summary).layout_portal = CollectionView.LayoutString(Doc.LayoutFieldKey(summary) + "-annotations");
        summary._backgroundColor = "#e2ad32";
        portal.layoutKey = "layout_portal";
        portal.title = "document collection";
        DocUtils.MakeLink({ doc: summary }, { doc: portal }, "summarizing", "");

        this.props.addLiveTextDocument(summary);
        MarqueeOptionsMenu.Instance.fadeOut(true);
    }

    @action
    background = (e: KeyboardEvent | React.PointerEvent | undefined) => {
        const newCollection = this.getCollection([], undefined, [StyleLayers.Background], undefined);
        this.props.addDocument?.(newCollection);
        MarqueeOptionsMenu.Instance.fadeOut(true);
        this.hideMarquee();
        setTimeout(() => this.props.selectDocuments([newCollection]));
    }

    @undoBatch
    marqueeCommand = action((e: KeyboardEvent) => {
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
        if ("cbtsSpg".indexOf(e.key) !== -1) {
            this._commandExecuted = true;
            e.stopPropagation();
            e.preventDefault();
            (e as any).propagationIsStopped = true;
            if (e.key === "g") this.collection(e, true);
            if (e.key === "c" || e.key === "t") this.collection(e);
            if (e.key === "s" || e.key === "S") this.summary(e);
            if (e.key === "b") this.background(e);
            if (e.key === "p") this.pileup(e);
            this.cleanupInteractions(false);
        }
        if (e.key === "r" || e.key === " ") {
            this._commandExecuted = true;
            e.stopPropagation();
            e.preventDefault();
            this._lassoFreehand = !this._lassoFreehand;
        }
    });

    touchesLine(r1: { left: number, top: number, width: number, height: number }) {
        for (const lassoPt of this._lassoPts) {
            const topLeft = this.Transform.transformPoint(lassoPt[0], lassoPt[1]);
            if (r1.left < topLeft[0] && topLeft[0] < r1.left + r1.width &&
                r1.top < topLeft[1] && topLeft[1] < r1.top + r1.height) {
                return true;
            }
        }
        return false;
    }

    boundingShape(r1: { left: number, top: number, width: number, height: number }) {
        const xs = this._lassoPts.map(pair => pair[0]);
        const ys = this._lassoPts.map(pair => pair[1]);
        const tl = this.Transform.transformPoint(Math.min(...xs), Math.min(...ys));
        const br = this.Transform.transformPoint(Math.max(...xs), Math.max(...ys));

        if (r1.left > tl[0] && r1.top > tl[1] && r1.left + r1.width < br[0] && r1.top + r1.height < br[1]) {
            let hasTop = false;
            let hasLeft = false;
            let hasBottom = false;
            let hasRight = false;
            for (const lassoPt of this._lassoPts) {
                const truePoint = this.Transform.transformPoint(lassoPt[0], lassoPt[1]);
                hasLeft = hasLeft || (truePoint[0] > tl[0] && truePoint[0] < r1.left) && (truePoint[1] > r1.top && truePoint[1] < r1.top + r1.height);
                hasTop = hasTop || (truePoint[1] > tl[1] && truePoint[1] < r1.top) && (truePoint[0] > r1.left && truePoint[0] < r1.left + r1.width);
                hasRight = hasRight || (truePoint[0] < br[0] && truePoint[0] > r1.left + r1.width) && (truePoint[1] > r1.top && truePoint[1] < r1.top + r1.height);
                hasBottom = hasBottom || (truePoint[1] < br[1] && truePoint[1] > r1.top + r1.height) && (truePoint[0] > r1.left && truePoint[0] < r1.left + r1.width);
                if (hasTop && hasLeft && hasBottom && hasRight) {
                    return true;
                }
            }
        }
        return false;
    }

    marqueeSelect(selectBackgrounds: boolean = true) {
        const selection: Doc[] = [];
        const selectFunc = (doc: Doc) => {
            const layoutDoc = Doc.Layout(doc);
            const bounds = { left: NumCast(doc.x), top: NumCast(doc.y), width: NumCast(layoutDoc._width), height: NumCast(layoutDoc._height) };
            if (!this._lassoFreehand) {
                intersectRect(bounds, this.Bounds) && selection.push(doc);
            } else {
                (this.touchesLine(bounds) || this.boundingShape(bounds)) && selection.push(doc);
            }
        };
        this.props.activeDocuments().filter(doc => this.props.layerProvider?.(doc) !== false && !doc.z).map(selectFunc);
        if (!selection.length && selectBackgrounds) this.props.activeDocuments().filter(doc => doc.z === undefined).map(selectFunc);
        if (!selection.length) this.props.activeDocuments().filter(doc => doc.z !== undefined).map(selectFunc);
        return selection;
    }

    @computed get marqueeDiv() {
        const cpt = this._lassoFreehand || !this._visible ? [0, 0] : [this._downX < this._lastX ? this._downX : this._lastX, this._downY < this._lastY ? this._downY : this._lastY];
        const p = this.props.getContainerTransform().transformPoint(cpt[0], cpt[1]);
        const v = this._lassoFreehand ? [0, 0] : this.props.getContainerTransform().transformDirection(this._lastX - this._downX, this._lastY - this._downY);
        return <div className="marquee" style={{
            transform: `translate(${p[0]}px, ${p[1]}px)`,
            width: Math.abs(v[0]),
            height: Math.abs(v[1]),
            zIndex: 2000
        }}> {this._lassoFreehand ?
            <svg height={2000} width={2000}>
                <polyline points={this._lassoPts.reduce((s, pt) => s + pt[0] + "," + pt[1] + " ", "")} fill="none" stroke="black" strokeWidth="1" strokeDasharray="3" />
            </svg>
            :
            <span className="marquee-legend" />}
        </div>;
    }

    render() {
        return <div className="marqueeView"
            style={{
                overflow: (!this.props.ContainingCollectionView && this.props.isAnnotationOverlay) ? "visible" :
                    StrCast(this.props.Document._overflow),
                cursor: MarqueeView.DragMarquee && this ? "crosshair" : "hand"
            }}
            onDragOver={e => e.preventDefault()}
            onScroll={(e) => e.currentTarget.scrollTop = e.currentTarget.scrollLeft = 0} onClick={this.onClick} onPointerDown={this.onPointerDown}>
            {this._visible ? this.marqueeDiv : null}
            {this.props.children}
        </div>;
    }
}