import React = require("react");
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { DateField } from "../../../new_fields/DateField";
import { Doc, DocListCast, Field, FieldResult, HeightSym, WidthSym, Opt } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";
import { RichTextField } from "../../../new_fields/RichTextField";
import { listSpec } from "../../../new_fields/Schema";
import { BoolCast, Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { AudioField, ImageField, PdfField, VideoField, WebField } from "../../../new_fields/URLField";
import { Utils, returnFalse } from "../../../Utils";
import { Docs, DocumentOptions } from "../../documents/Documents";
import { SelectionManager } from "../../util/SelectionManager";
import { undoBatch } from "../../util/UndoManager";
import { EditableView } from "../EditableView";
import { CollectionSubView, SubCollectionViewProps } from "./CollectionSubView";
import "./CollectionTimelineView.scss";
import { Thumbnail } from "./CollectionTimeLineViewNode";
import { Id } from "../../../new_fields/FieldSymbols";
import { library } from "@fortawesome/fontawesome-svg-core";
import { number } from "prop-types";
import { CollectionFreeFormDocumentView } from "../nodes/CollectionFreeFormDocumentView";
import { RichTextUtils } from "../../../new_fields/RichTextUtils";
import { DocumentView } from "../nodes/DocumentView";
import { emptyFunction, returnEmptyString, returnOne } from "../../../Utils";
import { Transform } from "../../util/Transform";
import { ContentFittingDocumentView } from "../nodes/ContentFittingDocumentView";
import { DragManager } from "../../util/DragManager";




type MarkerUnit = {
    document: Doc,
    element: JSX.Element,
    ref: HTMLDivElement | undefined,
    map: JSX.Element,
    mapref: HTMLDivElement | undefined;
    linkedthumbnail: Node | undefined;
};

type Tick = {
    counter: number,
    leftval: number,
    val: number,
    ref: React.RefObject<HTMLDivElement>;
    transform: number,
};

type Node = {
    doc: Doc;
    select?: boolean;
    horizontalPos: number;
    mapleft: number;
    row: number;
};

interface DocValuePair<T> {
    childDoc: Doc | undefined;
    value: T;
}

const comparators = {
    booleans: (a: DocValuePair<boolean>) => a.value ? 1 : -1,
    strings: (a: DocValuePair<string>, b: DocValuePair<string>) => a.value > b.value ? 1 : -1,
    numbers: (a: DocValuePair<number>, b: DocValuePair<number>) => a.value - b.value
};

@observer
export class CollectionTimelineView extends CollectionSubView(doc => doc) {
    private screenref = React.createRef<HTMLDivElement>();
    private barref = React.createRef<HTMLDivElement>();
    private sortReactionDisposer: IReactionDisposer | undefined;
    @observable private types: boolean[] = [];
    private marqueeref = React.createRef<HTMLDivElement>();
    private previewflag = true;
    private disposer: Opt<IReactionDisposer>;
    private documentThumbnailReferences: React.RefObject<Thumbnail>[] = [];

    @action
    onDrop = (e: React.DragEvent): Promise<void> => {
        const { pageX, pageY } = e;
        var pt = this.props.ScreenToLocalTransform().transformPoint(pageX, pageY);
        const mutator = (input: Doc | Doc[]) => {
            let newX = pageX;
            newX += -(document.body.clientWidth - this.barref.current!.getBoundingClientRect().width);
            let x = (((newX / this.barref.current!.getBoundingClientRect().width)) * (this.barwidth - this.rightbound - this.leftbound)) + this.leftbound;
            let fieldval = NumCast(this.props.Document.minvalue) + x * this._range * 1.1 / this.barref.current!.getBoundingClientRect().width;
            if (Array.isArray(input)) {
                for (let inputs of input) {
                    inputs[this.currentSortingKey] = fieldval;
                }
            }
            else {
                input[this.currentSortingKey] = fieldval;
            }
        };
        this.initiallyPopulateThumbnails();
        return super.onDrop(e, { x: pt[0], y: pt[1] }, undefined, mutator);
    }


    private get markerDocs() {
        let stored = Cast(this.props.Document.markers, listSpec(Doc));
        if (!stored) {
            this.props.Document.markers = stored = new List<Doc>();
        }
        return stored;
    }

    constructor(props: SubCollectionViewProps) {
        super(props);
    }

    @observable
    private previewdoc: Doc | undefined;
    @action
    makePreview(newdoc: Doc, string: string) {
        let text = Docs.Create.TextDocument({ width: 200, height: 100, x: 0, y: 0, autoHeight: true, title: "text" });
        let proto = text.proto!;
        let ting = NumCast(newdoc[this.currentSortingKey]);
        proto.data = new RichTextField(RichTextField.Initialize(this.currentSortingKey + ":" + String(ting)));
        let doc = Docs.Create.StackingDocument([newdoc, text,], { width: 500, height: 500, title: "Untitled Collection", chromeStatus: "disabled" });
        doc.title = "preview";
        this.previewdoc = doc;
    }

    @action
    updatePreview(newdoc: Doc, string: string) {
        const doclist = Cast(this.previewdoc.data, listSpec(Doc));
        let text = Docs.Create.TextDocument({ width: 200, height: 100, x: 0, y: 0, autoHeight: true, title: "text" });
        let proto = text.proto!;
        let ting = NumCast(newdoc[this.currentSortingKey]);
        proto.data = new RichTextField(RichTextField.Initialize(this.currentSortingKey + ":" + String(ting)));
        if (doclist) {
            doclist[0] = newdoc;
            doclist[1] = text;
        }
    }


    componentWillMount() {
        //context menu field    

        runInAction(() => {
            for (let i = 0; i < this.filtered.length; i++) {
                this.types[i] = true;
            }
            this.leftbound = 0;
            this.rightbound = 4;
        });
        this.initiallyPopulateThumbnails();
        this.initializeMarkers();
        this.createRows();
        this.createticks();
        this.filtermenu();
        this.createdownbool();
        window.addEventListener('resize', () => this.createRows(this.rowscale));
    }
    componentDidMount() {
        reaction(
            () => this.props.Document.currdoc,
            async () => {
                let doc = await Cast(this.props.Document.currdoc, Doc);
                let string = await StrCast(this.props.Document.currval);
                if (!this.previewdoc) {
                    doc ? this.makePreview(doc, string) : undefined;
                }
                else {
                    doc ? this.updatePreview(doc, string) : undefined;
                }
            }
        );

        reaction(
            () => this.childDocs,
            () => {
                this.initiallyPopulateThumbnails();
                this.createticks();
            }
        );
        reaction(
            () => this.props.Document.windowheight,
            () => {
                this.createRows();
                this.createticks();
            }
        );
        reaction(() => this.props.Document.barwidth,
            () => {
                this.rightbound = 4;
                this.leftbound = 0;
                this.initiallyPopulateThumbnails();
                this.createticks();

            });
        reaction(() => this.props.Document.verticalsortstate,
            () => {
                this.transtate = true;
                this.initiallyPopulateThumbnails();
                this.createticks();
            });
        reaction(
            () => this.props.Document.sortstate,
            async () => {
                this.transtate = true;
                this.initiallyPopulateThumbnails();
                this.createticks();
                let doc = await Cast(this.props.Document.currdoc, Doc);
                let string = await StrCast(this.props.Document.currval);
                doc ? this.updatePreview(doc, string) : undefined;
            }
        );
    }

    componentWillUnmount() {
        this.sortReactionDisposer && this.sortReactionDisposer();
        this.disposer && this.disposer();
    }


    @action
    initializeMarkers = async () => {
        let markers = this.markerDocs;
        for (let marker of markers) {
            let doc = await marker;
            let markerUnit = { document: doc, ref: undefined, mapref: undefined } as MarkerUnit;
            markerUnit.element = (<div>

                < div ref={(el) => el ? markerUnit.ref = el : null} onPointerDown={(e) => this.onPointerDown_DeleteMarker(e, String(markerUnit.document.annotation), markerUnit)}
                    style={{
                        top: "71%", border: "2px solid" + (markerUnit.document.color),
                        width: "10px", height: "30px", backgroundColor: String(markerUnit.document.color), opacity: 0.5, position: "fixed", left: 0,
                    }}>
                </div></div>);
            markerUnit.map = <div className="ugh" ref={(el) => el ? markerUnit.mapref = el : null}
                style={{
                    position: "absolute",
                    background: String(markerUnit.document.color),
                    zIndex: 1,
                    top: "80%",
                    left: NumCast(doc.initialMapLeft),
                    width: NumCast(doc.initialMapWidth),
                    border: "3px solid" + String(markerUnit.document.color)
                }}></div>;
        }
    }

    @action
    onPointerMove_LeftResize = (e: PointerEvent): void => {
        e.stopPropagation();
        this.markdoc!.initialLeft = NumCast(this.markdoc!.initialLeft) + e.movementX;
        this.markdoc!.initialWidth = NumCast(this.markdoc!.initialWidth) - e.movementX;
        document.addEventListener("pointerup", this.onPointerUp);
    }

    @observable markdoc: Doc | undefined = undefined;
    @action
    onPointerDown_LeftResize = (e: React.PointerEvent, doc: Doc): void => {
        if (e.button === 2) {
            this.markerDocs.splice(this.markerDocs.indexOf(doc), 1);
            this.selectedMarker = undefined;
            e.preventDefault();
            e.stopPropagation();
        }
        else {
            document.addEventListener("pointermove", (this.onPointerMove_LeftResize));
            e.stopPropagation();
            this.markdoc = doc;
        }
    }

    @action
    onPointerMove_RightResize = (e: PointerEvent): void => {
        e.stopPropagation();
        this.markdoc!.initialWidth = NumCast(this.markdoc!.initialWidth) + e.movementX;
        document.addEventListener("pointerup", this.onPointerUp);
    }

    @action
    onPointerDown_RightResize = (e: React.PointerEvent, doc: Doc): void => {
        if (e.button === 2) {
            this.markerDocs.splice(this.markerDocs.indexOf(doc), 1);
            this.selectedMarker = undefined;
            e.preventDefault();
            e.stopPropagation();
        }
        else {
            document.addEventListener("pointermove", (this.onPointerMove_RightResize));
            e.stopPropagation();
            this.markdoc = doc;
        }
    }

    createmarker = (doc: Doc): JSX.Element | undefined => {
        let markerUnit = { document: doc, ref: undefined, mapref: undefined } as MarkerUnit;
        markerUnit.element = (
            < div ref={(el) => el ? markerUnit.ref = el : null} onDoubleClick={(e) => this.doubleclick(e, markerUnit)} onPointerDown={(e) => this.onPointerDown_DeleteMarker(e, String(markerUnit.document.annotation), markerUnit)}
                style={{
                    border: "2px solid" + String(markerUnit.document.color),
                    top: this.rowval[Math.round(this.rowval.length / 2)],
                    width: NumCast(doc.initialWidth), height: this.rowscale, backgroundColor: String(markerUnit.document.color), zIndex: 5, opacity: 0.5, padding: "2px",
                    position: "absolute", left: NumCast(doc.initialLeft),
                }}>
                <div onPointerDown={(e) => this.onPointerDown_LeftResize(e, doc)} style={{ position: "absolute", width: "10px", cursor: "ew-resize", zIndex: 100, height: "100%" }}></div>
                <EditableView
                    contents={doc.annotation}
                    SetValue={this.annotationUpdate}
                    GetValue={() => ""}
                    display={"inline"}
                    height={30}
                    oneLine={true}
                />
                <div onPointerDown={(e) => this.onPointerDown_RightResize(e, doc)} style={{ position: "absolute", left: NumCast(doc.initialWidth), width: "10px", cursor: "ew-resize", zIndex: 100, height: "100%" }}></div>
            </div>);
        if (markerUnit.document.sortstate === this.currentSortingKey) {
            return markerUnit.element;
        }
        return undefined;
    }

    createmap = (doc: Doc) => {
        let map = <div
            style={{
                position: "absolute",
                background: String(doc.color),
                zIndex: 90,
                top: "80%",
                left: NumCast(doc.initialMapLeft),
                width: NumCast(doc.initialMapWidth),
                border: "3px solid" + String(doc.color)
            }}></div>;
        return map;
    }

    @action
    resetSelections() {
        this.selections = [];
        for (let thumbnail of this.thumbnails) {
            //this.unfocus(thumbnail.thumbnailref, thumbnail.headerref);
        }
    }

    private filterbuttons: JSX.Element[] = [];

    filtermenu() {
        let childDocs = DocListCast(this.props.Document.data);
        let types = new Set<string>();
        childDocs.map(doc => {
            let data = doc.data;
            if (!data) {
                return;
            }
            let type: string | undefined;
            if (data instanceof Promise) {
                data.then(field => {
                    field && (type = this.inferType(field)) && types.add(type);
                });
            } else {
                (type = this.inferType(data)) && types.add(type);
            }
        });

        let existingTypes = Array.from(types);
        this.filterbuttons = [];

        for (let i = 0; i < existingTypes.length; i++) {
            let doc = existingTypes[i];
            let button = React.createRef<HTMLInputElement>();
            this.filterbuttons.push(
                <div><input ref={button} type="checkbox" checked={this.types[i]} onChange={() => this.toggleFilter(doc, i, button)} />{doc}</div>);
        }
    }

    @action
    toggleFilter = (key: string, i: number, button: React.RefObject<HTMLInputElement>) => {
        if (this.filtered.includes(key)) {
            this.filtered.splice(this.filtered.indexOf(key), 1);
        }
        else {
            this.filtered.push(key);
        }
        this.types[i] = button.current!.checked;
        this.resetSelections();
    }

    // @action
    // select(e: React.MouseEvent<HTMLDivElement>, d: Doc, b: HTMLDivElement | undefined) {
    //     var thumbnail = undefined;
    //     var header = undefined;
    //     for (let thumbnails of this.thumbnails) {
    //         if (thumbnails.thumbnailref === b) {
    //             thumbnail = (thumbnails.thumbnailref);
    //             //header = thumbnails.headerref;
    //         }
    //     }
    //     if (e.ctrlKey) {
    //         if (thumbnail!.classList.contains("selected")) {
    //             //this.unfocus(thumbnail, header);
    //             for (let i = 0; i < this.selections.length; i++) {
    //                 if (this.selections[i] === thumbnail) {
    //                     this.selections.splice(i, 1);
    //                 }
    //             }
    //         }
    //         else {
    //             //this.focus(thumbnail, header);
    //             this.selections.push(thumbnail);
    //         }
    //     }
    //     else {
    //         this.selections = [];
    //         for (let thumbnails of this.thumbnails) {
    //             //this.unfocus(thumbnails.thumbnailref, thumbnails.headerref);
    //         }
    //         if (!thumbnail!.classList.contains("selected")) {
    //             //this.focus(thumbnail, header);
    //             this.selections.push(thumbnail);
    //         }
    //     }
    // }


    @observable private filtered: String[] = ["Audio", "Pdf", "Text", "Image", "Video", "Web", "Misc"];
    private selections: (HTMLDivElement | undefined)[] = [];
    @observable _lastX: number = 0;
    @observable _lastY: number = 0;
    @observable _downX: number = 0;
    @observable _downY: number = 0;
    @observable _visible: boolean = false;

    @action
    markerrender() {
        let markers = DocListCast(this.markerDocs);
        markers.forEach(doc => {
            let newscale = (this.barwidth / (this.barwidth - this.rightbound - this.leftbound));
            doc.initialLeft = (NumCast(doc.initialLeft) * (newscale / NumCast(doc.initialScale)));
            //doc.initialLeft = (NumCast(doc.initialLeft) * newscale / NumCast(doc.initialScale)) - newscale * (this.leftbound - NumCast(doc.initialX));
            doc.initialX = this.leftbound;
            doc.initialWidth = (NumCast(doc.initialWidth) * newscale / NumCast(doc.initialScale));
            doc.initialScale = newscale;
        });
    }


    @action
    onPointerDown_DeleteMarker = (e: React.PointerEvent, annotation: string, markerUnit: MarkerUnit): void => {

        if (e.button === 2) {
            this.markerDocs.splice(this.markerDocs.indexOf(markerUnit.document), 1);
            this.selectedMarker = undefined;
            e.preventDefault();
            e.stopPropagation();
        }
        else {
            e.preventDefault();
            e.stopPropagation();
            this.selectedMarker ? this.selectedMarker.ref!.style.opacity = "0.5" : null;
            this.selectedMarker ? this.selectedMarker.ref!.style.border = "0px solid black" : null;
            this.selectedMarker = markerUnit;
            this.selectedMarker.ref!.style.opacity = "0.9";
            this.selectedMarker.ref!.style.border = "1px solid black";
            this.selectedMarker.ref!.style.borderStyle = "dashed";
            this.selectedMarker.ref!.style.backgroundColor ? this.props.Document.selectedColor = this.selectedMarker.ref!.style.backgroundColor : null;
        }

    }

    @action
    doubleclick(e: React.MouseEvent, markerUnit: MarkerUnit) {
        if (markerUnit.ref!.style.border === "1px dashed black") {
            this.leftbound = NumCast(markerUnit.document.initialMapLeft);
            this.rightbound = this.barwidth - NumCast(markerUnit.document.initialMapWidth) - this.leftbound;
        }
        this.createticks();
        this.markerrender();
    }

    private preventbug: boolean = false;

    onPointerMove_Selector = async (e: PointerEvent) => {
        let doc = await this.markerDocs[this.markerDocs.length - 1];
        if (this.preventbug) {
            let newX = NumCast(doc.initialWidth);
            let newX2 = NumCast(doc.initialMapWidth);
            let newmapwidth = newX2 + e.movementX / (this.barwidth / (this.barwidth - this.rightbound - this.leftbound));
            let newwidth = newX + e.movementX;
            let leftval = NumCast(doc.initialLeft) + newwidth;
            let mintick: React.RefObject<HTMLDivElement>;
            let minticknum = Infinity;
            for (let ticks of this.tickrefs) {
                if (ticks.current !== null) {
                    ticks.current!.classList.remove("hover");
                    if (Math.abs(leftval - parseFloat(ticks.current.style.left!)) < minticknum) {
                        minticknum = Math.abs(leftval - parseFloat(ticks!.current.style.left!));
                        mintick = ticks;
                    }
                }
            }
            mintick!.current!.classList.add("hover");
            doc.initialWidth = newwidth;
            doc.initialMapWidth = newmapwidth;
        }
    }

    @action
    onPointerUp_Selector = async (e: PointerEvent) => {
        this.downbool = true;

        document.removeEventListener("pointermove", this.onPointerMove_Selector, true);
        let mintick: React.RefObject<HTMLDivElement>;
        let minticknum = Infinity;
        let doc = await this.markerDocs[this.markerDocs.length - 1];
        let leftval = NumCast(doc.initialLeft) + NumCast(doc.initialWidth);
        for (let ticks of this.tickrefs) {
            if (ticks.current !== null) {
                ticks.current!.classList.remove("hover");

                if (Math.abs(leftval - parseFloat(ticks.current.style.left!)) < minticknum) {
                    minticknum = Math.abs(leftval - parseFloat(ticks!.current.style.left!));
                    mintick = ticks;
                }
            }
        }

        doc.initialWidth = parseFloat(mintick!.current!.style.left!) - NumCast(doc.initialLeft);
        if (doc.initialWidth === 0) {
            runInAction(() => this.markerDocs.pop());
        }
    }

    private _values: DocValuePair<number>[] = [{ childDoc: undefined, value: 0 }];
    @observable private thumbnails: Node[] = [];
    private filterDocs = (thumbnail: Node[]): Node[] => {
        let thumbnails = [];
        for (let oldthumbnail of thumbnail) {
            if (this.filtered.includes("Image")) { if (oldthumbnail.doc.data instanceof ImageField) { thumbnails.push(oldthumbnail); } }
            if (this.filtered.includes("Audio")) { if (oldthumbnail.doc.data instanceof AudioField) { thumbnails.push(oldthumbnail); } }
            if (this.filtered.includes("Pdf")) { if (oldthumbnail.doc.data instanceof PdfField) { thumbnails.push(oldthumbnail); } }
            if (this.filtered.includes("Text")) { if (oldthumbnail.doc.data instanceof RichTextField) { thumbnails.push(oldthumbnail); } }
            if (this.filtered.includes("Video")) { if (oldthumbnail.doc.data instanceof VideoField) { thumbnails.push(oldthumbnail); } }
            if (this.filtered.includes("Web")) { if (oldthumbnail.doc.data instanceof WebField) { thumbnails.push(oldthumbnail); } }
            else if (this.filtered.includes("Misc")) { thumbnails.push(oldthumbnail); }
        }
        return thumbnails;
    }

    private inferType = (data: FieldResult<Field>) => {
        if (!data) {
            return undefined;
        }
        switch (data.constructor) {
            case ImageField: return "Image";
            case AudioField: return "Audio";
            case PdfField: return "PDF";
            case RichTextField: return "Text";
            case VideoField: return "Video";
            case WebField: return "Image";
            case DateField: return "Date";
            case List: return "Collection";
            default:
                return undefined;
        }
    }
    @observable
    private toggle_tick_numbers: boolean = true;
    @action
    initiallyPopulateThumbnails() {
        this.thumbnails = [];
        const childDocs = this.childDocs;
        let validatedChildren = childDocs.filter(doc => doc[this.currentSortingKey]);

        const childCount = validatedChildren.length;
        if (!childCount) {
            return;
        }

        const partitioned = {
            booleans: [] as DocValuePair<boolean>[],
            strings: [] as DocValuePair<string>[],
            numbers: [] as DocValuePair<number>[]
        };
        validatedChildren.map(childDoc => {
            const value = childDoc[this.currentSortingKey];
            switch (typeof value) {
                case "boolean":
                    partitioned.booleans.push({ childDoc, value });
                    break;
                case "string":
                    partitioned.strings.push({ childDoc, value });
                    break;
                case "number":
                    partitioned.numbers.push({ childDoc, value });
                    break;
                default:
                    alert(`${this.currentSortingKey} is not a valid sorting key for this collection, since ${childDoc[Id]} has a non-primitive field type at this key!`);
                    return;
            }
        });

        const partitions = Object.values(partitioned);
        const hasMixedTypes = partitions.filter(partition => partition.length).length > 1;
        const { booleans, strings, numbers } = partitioned;

        let sortedPairs: DocValuePair<any>[];
        if (hasMixedTypes) {
            const serialized: DocValuePair<string>[] = strings;
            for (const { childDoc, value } of booleans) {
                serialized.push({ childDoc, value: String(value) });
            }
            for (const { childDoc, value } of numbers) {
                serialized.push({ childDoc, value: String(value) });
            }
            sortedPairs = serialized.sort(comparators.strings);
        } else if (booleans.length) {
            sortedPairs = booleans.sort(comparators.booleans);
        } else if (numbers.length) {
            sortedPairs = numbers.sort(comparators.numbers);
        } else if (strings.length) {
            sortedPairs = strings.sort(comparators.strings);
        } else {
            return;
        }

        this.documentThumbnailReferences = [];

        // can we tighten this up? not well defined
        this._range = (sortedPairs.lastElement().value - sortedPairs[0].value);
        let laststring = undefined;
        this.toggle_tick_numbers = true;
        if (this._range === 0) {
            this.toggle_tick_numbers = false;

        }
        if (isNaN(this._range)) {
            this.toggle_tick_numbers = false;
            this._range = sortedPairs.length;
            for (let i = 0; i < sortedPairs.length; i++) {
                if (i !== 0 && sortedPairs[i].value === laststring) {
                    laststring = sortedPairs[i].value;
                    sortedPairs[i].value = sortedPairs[i - 1].value;
                }
                else {
                    laststring = sortedPairs[i].value;
                    sortedPairs[i].value = i;
                }
            }
        }

        this._values = sortedPairs;

        let { value: first } = sortedPairs[0];
        for (const { value, childDoc } of sortedPairs) {
            this.thumbnails.push({
                mapleft: this.computeMapPosition(first, value),
                horizontalPos: this.computeHorizontalPosition(first, value),
                doc: childDoc,
                row: Math.round(this.rowval.length / 2) - 1,
                select: false
            });
        }

        this.removeOverlap();
        if (sortedPairs.length === 0) {
            this._values.push({ childDoc: undefined, value: 0 });
        }
    }

    private computeMapPosition(first: number, current: number): number {
        const padding = 0.05;
        const currentPosition = (this._range * padding) + current - first;
        const fractionalOffset = this.barwidth / (this._range * (1 + 2 * padding));
        return currentPosition * fractionalOffset;
    }

    private computeHorizontalPosition(first: number, current: number): number {
        const zoomFactor = this.barwidth / (this.barwidth - this.rightbound - this.leftbound);
        const leftOffset = this.leftbound * zoomFactor;
        return (this.computeMapPosition(first, current) * zoomFactor) - leftOffset;
    }

    @action
    updateThumbnailValues() {
        this.removeOverlap();
    }

    @action
    removeOverlap() {
        for (let thumbnail1 of this.thumbnails) {
            thumbnail1.row = Math.round(this.rowval.length / 2) - 1;
        }
        let overlap = false;
        while (overlap === false) {
            overlap = true;
            let pos = true;
            let counter = 0;
            for (let thumbnail1 of this.thumbnails) {
                pos = true;
                counter = 0;
                for (let thumbnail2 of this.thumbnails) {
                    if (thumbnail1 === thumbnail2) {
                        continue;
                    }
                    if (thumbnail1.row === thumbnail2.row && this.checkOverlap(thumbnail1, thumbnail2)) {
                        if (pos === true) {
                            counter++;
                            thumbnail2.row += counter;
                            pos = false;
                        } else {
                            thumbnail2.row -= counter;
                            pos = true;
                        }
                        overlap = false;
                    }
                }
                for (let thumbnail1 of this.thumbnails) {
                    if (thumbnail1.row === Math.round(this.rowval.length / 2)) {
                        thumbnail1.row++;
                        overlap = false;
                    }
                }
            }
            for (let thumbnail1 of this.thumbnails) {
                for (let thumbnail2 of this.thumbnails) {
                    if (thumbnail1.row !== thumbnail2.row) {
                        if (thumbnail1.doc[this.verticalSortingKey] < thumbnail2.doc[this.verticalSortingKey] && thumbnail1.row > thumbnail2.row && this.checkOverlap(thumbnail1, thumbnail2)) {
                            let row1 = thumbnail1.row;
                            let row2 = thumbnail2.row;
                            thumbnail1.row = row2;
                            thumbnail2.row = row1;
                        }
                        else if (thumbnail1.doc[this.verticalSortingKey] > thumbnail2.doc[this.verticalSortingKey] && thumbnail1.row < thumbnail2.row && this.checkOverlap(thumbnail1, thumbnail2)) {
                            let row1 = thumbnail1.row;
                            let row2 = thumbnail2.row;
                            thumbnail1.row = row2;
                            thumbnail2.row = row1;
                        }
                    }
                }
            }
            // for (let thumbnail of this.thumbnails) {
            //     if (thumbnail.row >= this.rows.length) {
            //         this.rowscale = this.rowscale * 0.9;
            //     }
            // }
        }
    }

    private checkOverlap = (a: Node, b: Node): boolean => {

        const { horizontalPos: first } = a;
        const { horizontalPos: second } = b;
        const leftOverlap = first >= second && first - this.rowscale < second;
        const rightOverlap = first <= second && first + this.rowscale > second;
        return leftOverlap || rightOverlap;
    }

    private tickrefs: React.RefObject<HTMLDivElement>[] = [];
    private tickvals: Tick[] = [];
    createticks = () => {
        //Creates the array of tick marks.
        let counter = 0;
        this.tickvals = [];
        for (let i = 0; i < this.barwidth; i += this.barwidth / 1000) {
            let leftval = ((i * (this.barwidth / (this.barwidth - this.rightbound - this.leftbound)) - (this.leftbound * (this.barwidth) / (this.barwidth - this.rightbound - this.leftbound))));
            let tickref = React.createRef<HTMLDivElement>();
            this.tickrefs.push(tickref);
            let val = 0;
            let scale = (this.barwidth - this.rightbound - this.leftbound) / this.barwidth;
            if (counter % 100 === 0) {
                val = Math.round(counter * this._range * 1.1 / 1000 + this._values[0].value - this._range * 0.05);
                let t = { counter: counter, leftval: leftval, val: val, ref: tickref, transform: scale } as Tick;
                this.tickvals.push(t);
            }
            else if (counter % 50 === 0) {
                let t = { counter: counter, leftval: leftval, val: val, ref: tickref, transform: scale } as Tick;
                this.tickvals.push(t);
            }
            else if (counter % 10 === 0) {
                let t = { counter: counter, leftval: leftval, val: val, ref: tickref, transform: scale } as Tick;
                this.tickvals.push(t);
            }
            counter++;
        }
        this.updateThumbnailValues();
    }

    @action
    createRows(number?: number) {
        this.rowval = [];
        this.windowheight = this.props.PanelHeight();
        for (let i = 0; i < this.windowheight; i
            += this.rowscale) {
            this.rowval.push(i);
        }
        this.rowval.pop();
        while (this.rowval.length < 5) {
            this.rowscale = this.rowscale * 0.8;
            this.rowval = [];
            this.windowheight = this.props.PanelHeight();
            for (let i = 0; i < this.windowheight; i
                += this.rowscale) {
                this.rowval.push(i);
            }
            this.rowval.pop();
        }
        this.updateThumbnailValues();
    }

    @observable
    private rowval: number[] = [];

    @observable private rowscale: number = 50;

    @observable private selectedMarker: MarkerUnit | undefined;

    private get selectedColor() {
        let doc = this.props.Document;
        let color: string;
        if (doc.selectedColor) {
            color = StrCast(this.props.Document.selectedColor);
        } else {
            color = doc.selectedColor = "ffff80";
        }
        return color;
    }

    @action
    onPointerDown_AdjustScale = (e: React.PointerEvent<HTMLDivElement>): void => {
        this.downbool = false;
        if (e.button === 0) {
            document.addEventListener("pointermove", this.onPointerMove_AdjustScale);
            document.addEventListener("pointerup", this.onPointerUp_Dragger);
            e.stopPropagation();
            e.preventDefault();
        }
    }

    @action
    onPointerMove_AdjustScale = (e: PointerEvent): void => {
        this.downbool = false;
        e.stopPropagation();
        e.preventDefault();
        let number = e.movementY;
        if (this.rowscale + number <= 40) {
            this.rowscale = 40;
        }
        else if (this.rowscale + number >= 100) {
            this.rowscale = 100;
        }
        else {
            this.rowscale += number;
        }
        this.createRows();
        document.addEventListener("pointerup", this.onPointerUp_Dragger);
    }
    @computed
    private get leftbound() {
        let doc = this.props.Document;
        if (doc.leftbound) {

            return NumCast(doc.leftbound);
        } else {
            return 0;
        }
        return NumCast(doc.leftbound);
    }

    private set leftbound(number) {
        this.props.Document.leftbound = number;
    }

    @computed
    private get rightbound() {
        let doc = this.props.Document;
        if (doc.rightbound) {

            return NumCast(doc.rightbound);
        } else {
            return 4;
        }
        return NumCast(doc.rightbound);
    }

    private set rightbound(number) {
        this.props.Document.rightbound = number;
    }


    private get barwidth() {
        let doc = this.props.Document;
        doc.barwidth = this.props.PanelWidth();
        return NumCast(doc.barwidth);
    }

    private set windowheight(number) {
        this.props.Document.windowheight = number;
    }

    private get windowheight() {
        let doc = this.props.Document;
        doc.windowheight = this.props.PanelHeight();
        return NumCast(doc.windowheight);
    }

    private set barwidth(number) {
        this.props.Document.barwidth = number;
    }

    private get currentSortingKey() {
        let doc = this.props.Document;
        if (!doc.sortstate) {
            this.currentSortingKey = "x";
        }
        return String(doc.sortstate);
    }

    private set rowPrev(boolean: boolean) {
        this.props.Document.rowPrev = boolean;
    }

    private get rowPrev() {
        let doc = this.props.Document;
        if (!doc.rowPrev) {
            this.rowPrev = false;
        }
        return BoolCast(doc.rowPrev);
    }

    private set bugfix(boolean: boolean) {
        this.props.Document.bugfix = boolean;
    }

    private get bugfix() {
        let doc = this.props.Document;
        if (!doc.bugfix) {
            this.bugfix = false;
        }
        return BoolCast(doc.bugfix);
    }

    private set update(boolean: boolean) {
        this.props.Document.update = boolean;
    }

    private get update() {
        let doc = this.props.Document;
        if (!doc.update) {
            this.update = false;
        }
        return BoolCast(doc.update);
    }

    private set transtate(boolean: boolean) {
        this.props.Document.transtate = boolean;
    }

    private get transtate() {
        let doc = this.props.Document;
        if (doc.transtate === undefined) {
            doc.transtate = true;
        }
        return BoolCast(doc.transtate);
    }


    private set opac(boolean: boolean) {
        this.props.Document.opac = boolean;
    }

    private get opac() {
        let doc = this.props.Document;
        if (!doc.opac) {
            this.opac = false;
        }
        return BoolCast(doc.opac);
    }

    private set currentSortingKey(string) {
        this.props.Document.sortstate = string;

    }

    private get verticalSortingKey() {
        let doc = this.props.Document;
        if (!doc.verticalsortstate) {
            this.verticalSortingKey = "y";
        }
        return String(doc.verticalsortstate);
    }

    private set verticalSortingKey(string) {
        this.props.Document.verticalsortstate = string;
    }

    @action annotationUpdate = (newValue: string) => {
        if (newValue !== "") {
            this.selectedMarker!.document.annotation = newValue;
        }
        if (this.selectedMarker!.document.annotation === "") {
            this.selectedMarker!.document.annotation = "Edit me!";
        }
        return true;
    }

    private _range = 0;

    private get minvalue() {
        let doc = this.props.Document;
        return NumCast(doc.minvalue);
    }

    private set minvalue(number) {
        this.props.Document.minvalue = number;
    }


    @action
    leftboundSet = (number: number) => {
        this.transtate = false;
        runInAction(() => this.leftbound = number);
        this.markerrender();
    }
    @action
    rightboundSet = (number: number) => {
        this.transtate = false;
        this.rightbound = number;
        this.markerrender();
    }

    @action
    onPointerDown_Dragger = async (e: React.PointerEvent) => {
        for (let thumbnails of this.thumbnails) {
            if (thumbnails.select !== false) {
                thumbnails.select = false;
            }
        }
        e.persist();
        this._downX = e.pageX;
        this._downY = e.pageY;
        if (e.button === 2) {
            document.addEventListener("pointermove", this.onPointerMove_Marquee, true);
            document.addEventListener("pointerup", this.onPointerUp_Marquee, true);
        }
    }

    @action
    onPointerDown_Timeline = async (e: React.PointerEvent) => {
        e.persist();
        this._downX = e.pageX;
        this._downY = e.pageY;
        let leftval = 0;
        if (this.screenref.current) {

            leftval = (e.pageX - this.screenref.current.getBoundingClientRect().left + this.leftbound * this.nodeoffset);
        }
        let mintick: React.RefObject<HTMLDivElement>;

        let minticknum = Infinity;
        for (let ticks of this.tickrefs) {
            if (ticks.current !== null) {
                if (Math.abs(leftval - parseFloat(ticks.current.style.left!)) < minticknum) {
                    minticknum = Math.abs(leftval - parseFloat(ticks!.current.style.left!));
                    mintick = ticks;
                }
            }
        }
        if (e.button === 0) {
            leftval = parseFloat(mintick!.current!.style.left!);
            let d = new Doc;
            document.addEventListener("pointermove", this.onPointerMove_Selector, true);
            document.addEventListener("pointerup", this.onPointerUp_Selector, true);
            this.preventbug = true;
            e.preventDefault;
            d.initialLeft = leftval;
            d.firstLeft = leftval;
            d.initialScale = (this.barwidth / (this.barwidth - this.rightbound - this.leftbound));
            d.initialX = this.leftbound;
            d.initialWidth = 10;
            d.initialMapLeft = (((leftval / this.barref.current!.getBoundingClientRect().width)) * (this.barwidth - this.rightbound - this.leftbound)) + this.leftbound;
            d.initialMapWidth = 10;
            d.annotation = "Edit me!";
            d.color = this.selectedColor;
            d.sortstate = this.currentSortingKey;
            this.markerDocs.push(d);
        }
        if (e.button === 2) {
            document.addEventListener("pointermove", this.onPointerMove_Marquee, true);
            document.addEventListener("pointerup", this.onPointerUp_Marquee, true);
        }
    }


    @action
    onPointerMove_Marquee = async (e: PointerEvent) => {
        this._lastY = e.pageY;
        this._lastX = e.pageX;
        this.marqueeSelect();
        if (Math.abs(this._lastX - this._downX) > Utils.DRAG_THRESHOLD ||
            Math.abs(this._lastY - this._downY) > Utils.DRAG_THRESHOLD) {
            this._visible = true;
            e.stopPropagation();
            e.preventDefault();
        }

    }

    @action
    onPointerUp_Marquee = (e: PointerEvent): void => {
        this.downbool = true;
        document.removeEventListener("pointermove", this.onPointerMove_Marquee, true);
        if (this._visible) {
            if (!e.shiftKey) {
                SelectionManager.DeselectAll(undefined);
            }
        }
        runInAction(() => this._visible = false);
        this.preventbug = false;
        for (let select of this.newselect) {
            if (!this.selections.includes(select)) {
                this.selections.push(select);
            }
        }
    }

    marqueeSelect() {
        if (this.marqueeref.current !== null) {
            let posInfo = this.marqueeref.current.getBoundingClientRect();
            let offset = this.screenref.current!.getBoundingClientRect().left - this.leftbound * this.nodeoffset;
            console.log(offset);
            let offsety = this.screenref.current!.getBoundingClientRect().top;
            let newselects: Doc[] | undefined = [];
            for (let thumbnails of this.thumbnails) {
                let thumbnailinfoleft = thumbnails.horizontalPos * this.nodeoffset + offset;
                let thumbnailinforight = thumbnails.horizontalPos * this.nodeoffset + this.rowscale + offset;
                let thumbnailinfotop = this.rowval[thumbnails.row] + offsety;
                let thumbnailinfobottom = this.rowval[thumbnails.row] + this.rowscale + offsety;

                if ((thumbnailinfoleft > posInfo.left && thumbnailinfoleft < posInfo.right) || (thumbnailinforight > posInfo.left && thumbnailinforight < posInfo.right)) {
                    if ((thumbnailinfobottom < posInfo.bottom && thumbnailinfobottom > posInfo.top) || (thumbnailinfotop > posInfo.top && thumbnailinfotop < posInfo.bottom)) {
                        thumbnails.select = true;
                        newselects.push(thumbnails.doc);
                    }
                    else {
                        newselects.includes(thumbnails.doc) && newselects.splice(newselects.indexOf(thumbnails.doc), 1);
                    }
                }
                else {
                    newselects.includes(thumbnails.doc) && newselects.splice(newselects.indexOf(thumbnails.doc), 1);
                }
            }
        }
    }
    private newselect: (HTMLDivElement | undefined)[] = [];

    focus(thumbnail: HTMLDivElement | undefined, header: HTMLDivElement | undefined) {
        thumbnail!.classList.toggle("selected", true);
        thumbnail!.classList.toggle("unselected", false);
        header!.classList.toggle("selection", true);
        header!.classList.toggle("unselection", false);
    }

    unfocus(thumbnail: HTMLDivElement | undefined, header: HTMLDivElement | undefined) {
        thumbnail!.classList.toggle("selected", false);
        thumbnail!.classList.toggle("unselected", true);
        header!.classList.toggle("selection", false);
        header!.classList.toggle("unselection", true);
    }


    @computed
    get marqueeDiv() {
        let v = this.props.ScreenToLocalTransform().translate(0, 0).transformDirection(this._lastX - this._downX, this._lastY - this._downY);
        return <div ref={this.marqueeref} className="marquee" style={{ width: `${Math.abs(v[0])}`, height: `${Math.abs(v[1])}`, zIndex: 2000 }} >
        </div>;
    }

    @action
    onPointerUp_Dragger = (e: PointerEvent): void => {
        this.downbool = true;
        document.removeEventListener("pointermove", this.onPointerMove_AdjustScale);
    }

    @undoBatch
    makeBtnClicked = (): void => {
        let doc = Doc.GetProto(this.props.Document);
        doc.isButton = !BoolCast(doc.isButton);
        if (doc.isButton) {
            if (!doc.nativeWidth) {
                doc.nativeWidth = this.props.Document[WidthSym]();
                doc.nativeHeight = this.props.Document[HeightSym]();
            }
        } else {
            doc.nativeWidth = doc.nativeHeight = undefined;
        }
    }

    makeportal() {
        console.timeLog("portal made");
        let portal = Docs.Create.FreeformDocument([], { width: 100, height: 100, title: this.props.Document.title + ".portal" });
        //DocUtils.MakeLink(this.props.Document, portal, undefined, this.props.Document.title + ".portal");
        //this.makeBtnClicked();
        this.props.addDocTab && this.props.addDocTab(portal, portal, "onBottom");
        this.createRows();
    }

    @observable private transition: boolean | undefined;

    @action
    opacset = (boolean: boolean) => {
        this.opac = boolean;
    }

    @observable
    downbool: boolean | undefined;

    @action
    createdownbool() {
        if (this.downbool === undefined) {
            this.downbool = true;
        }
    }

    @action
    onPointerDown_OnBar = (e: React.PointerEvent): void => {
        this.downbool = false;
        document.addEventListener("pointermove", this.onPointerMove_OnBar);
        e.stopPropagation();
        e.preventDefault();
    }

    @action
    onPointerMove_OnBar = (e: PointerEvent): void => {
        this.transtate = false;
        e.stopPropagation();
        let newx2 = this.rightbound - e.movementX;
        let newx = this.leftbound + e.movementX;
        if (newx2 < 4) {
            this.rightbound = 4;
        }
        else if (newx < 0) {
            this.leftbound = 0;
            this.rightbound = (newx2 + e.movementX);
        }
        else {
            this.leftbound = (this.leftbound + e.movementX);
            this.rightbound = (this.rightbound - e.movementX);
        }
        //this.createticks();
        document.addEventListener("pointerup", this.onPointerUp);
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove_LeftBound);
        document.removeEventListener("pointermove", this.onPointerMove_RightBound);
        document.removeEventListener("pointermove", this.onPointerMove_OnBar);
        document.removeEventListener("pointermove", this.onPointerMove_LeftResize);
        document.removeEventListener("pointermove", this.onPointerMove_RightResize);
        document.body.style.cursor = "default";
        this.downbool = true;
    }

    @action
    onPointerMove_LeftBound = (e: PointerEvent): void => {
        this.transtate = false;

        e.stopPropagation();
        if (this.leftbound + e.movementX < 0) {
            this.leftbound = 0;
        }
        else if (this.leftbound + e.movementX + 20 > this.barwidth - this.rightbound) {
            this.leftbound = (this.barwidth - this.rightbound - 20);
        }
        else {
            this.leftbound = (this.leftbound + e.movementX);
        }
        //this.createticks();
        document.addEventListener("pointerup", this.onPointerUp);
        this.markerrender();
    }

    @action
    onPointerMove_RightBound = (e: PointerEvent): void => {
        this.transtate = false;

        e.stopPropagation();
        if (this.rightbound - e.movementX < 4) {
            this.rightbound = 4;
        }
        else if (this.rightbound + this.leftbound - e.movementX + 20 > this.barwidth) {
            this.rightbound = (this.barwidth - this.leftbound - 20);
        }
        else { this.rightbound = (this.rightbound - e.movementX); }


        //this.createticks();

        document.addEventListener("pointerup", this.onPointerUp);
        this.markerrender();

    }

    @action
    onPointerDown_LeftBound = (e: React.PointerEvent): void => {
        document.addEventListener("pointermove", this.onPointerMove_LeftBound);
        e.stopPropagation();
        this.downbool = false;
    }

    @action
    onPointerDown2_RightBound = (e: React.PointerEvent): void => {
        document.addEventListener("pointermove", this.onPointerMove_RightBound);
        e.stopPropagation();
        this.downbool = (false);
    }

    @action
    onPointerDown_OffBar = (e: React.PointerEvent): void => {
        this.props.addDocument(new Doc);
        this.transtate = false;
        this.downbool = false;
        let temp = this.barwidth - this.rightbound - this.leftbound;
        let newx = e.pageX - document.body.clientWidth + this.screenref.current!.clientWidth / 0.98;
        this.leftbound = (newx);
        if (this.leftbound < 0) {
            this.leftbound = (0);
            newx = 0;
        }

        let newx2 = this.barwidth - temp - newx;
        this.rightbound = (newx2);
        if (newx2 < 4) {
            this.leftbound = (newx + newx2);
            this.rightbound = (4);
        }
        e.stopPropagation();
    }


    @observable firstround: boolean = false;

    callback(t: Tick) {
        if (t.counter % 100 === 0 && this.toggle_tick_numbers === true) {
            return (<div className="max" ref={t.ref} style={{
                position: "absolute", top: "0%", left: t.leftval * (this.barwidth / (this.barwidth - this.leftbound - this.rightbound)), zIndex: 1, writingMode: "vertical-rl",
                textOrientation: "mixed",
            }
            }> <div style={{ paddingTop: "10px" }}>{t.val}</div></div>);
        }
        else if (t.counter % 100 === 0) {
            return (<div className="max" ref={t.ref} style={{
                position: "absolute", top: "0%", left: t.leftval * (this.barwidth / (this.barwidth - this.leftbound - this.rightbound)), zIndex: 1, writingMode: "vertical-rl",
                textOrientation: "mixed",
            }
            }></div>);
        }
        else if (t.counter % 50 === 0) {
            return (<div className="max2" ref={t.ref} style={{ position: "absolute", top: "0%", left: t.leftval * (this.barwidth / (this.barwidth - this.leftbound - this.rightbound)), zIndex: 1 }} />);
        }
        else if (t.counter % 10 === 0) {
            return (<div className="active" ref={t.ref} style={{ position: "absolute", top: "0%", left: t.leftval * (this.barwidth / (this.barwidth - this.leftbound - this.rightbound)), zIndex: 1 }} />);
        }
    }

    private get nodeoffset() {
        return this.barwidth / (this.barwidth - this.leftbound - this.rightbound);
    }

    sethoverdoc(doc: Doc) {
        this.previewdoc = doc;
    }

    @observable
    private previewwidth: number = 500;

    @observable
    private previewheight: number = 500;

    _ignore = 0;
    onPreWheel = (e: React.WheelEvent) => {
        this._ignore = e.timeStamp;
    }
    onPrePointer = (e: React.PointerEvent) => {
        this._ignore = e.timeStamp;
    }
    onPostPointer = (e: React.PointerEvent) => {
        if (this._ignore !== e.timeStamp) {
            e.stopPropagation();
        }
    }
    onPostWheel = (e: React.WheelEvent) => {
        if (this._ignore !== e.timeStamp) {
            e.stopPropagation();
        }
    }
    private getLocalTransform = (): Transform => new Transform(-NumCast(this.previewdoc!.x), -NumCast(this.previewdoc!.y), 1);

    private getTransform = (): Transform => this.props.ScreenToLocalTransform().transform(this.getLocalTransform());
    private getTransformOverlay = (): Transform => this.props.ScreenToLocalTransform();

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.DocumentDragData && de.data.droppedDocuments.length && de.data.droppedDocuments[0] === this.previewdoc) {
            let [xp, yp] = this.props.ScreenToLocalTransform().transformPoint(de.x, de.y);
            if (super.drop(e, de)) {
                if (de.data instanceof DragManager.DocumentDragData) {
                    if (de.data.droppedDocuments.length) {
                        this.previewdoc.x = xp - de.data.offset[0];
                        this.previewdoc.y = yp - de.data.offset[1];
                    }
                }
            }
        } else {
            super.drop(e, de);
        }
        return false;
    }

    render() {
        this.props.Document._range = this._range;
        this.props.Document.minvalue = this.props.Document.minvalue = this._values[0].value - this._range * 0.05;
        let p: [number, number] = this._visible ? this.props.ScreenToLocalTransform().translate(0, 0).transformPoint(this._downX < this._lastX ? this._downX : this._lastX, this._downY < this._lastY ? this._downY : this._lastY) : [0, 0];
        let d = this.previewdoc;
        let width = 50;
        let height = 50;
        if (d) {
            let nativeWidth = NumCast(d.nativeWidth, width);
            let nativeHeight = NumCast(d.nativeHeight, height);

            let wscale = width / (nativeWidth ? nativeWidth : width);
            if (wscale * nativeHeight > height) {
                wscale = height / (nativeHeight ? nativeHeight : height);
            }
            let contentScaling = () => wscale;
            let transform = () => new Transform(0, 0, 1);
            let centeringOffset = () => (width - nativeWidth * contentScaling()) / 2;

            let getTransform = () => transform().translate(-centeringOffset, 0).scale(1 / contentScaling());
        }

        return (
            <div ref={this.createDropTarget} onDrop={this.onDrop.bind(this)}>
                <div className="collectionTimelineView" ref={this.screenref} style={{ overflow: "hidden", width: "100%", height: this.windowheight }} onWheel={(e: React.WheelEvent) => e.stopPropagation()}>
                    <div>
                        {this.previewdoc !== undefined ?
                            <div style={{ left: NumCast(this.previewdoc.x), top: NumCast(this.previewdoc.y), width: NumCast(this.previewdoc.width), zIndex: 500, height: NumCast(this.previewdoc.height), position: "absolute", }}>
                                <ContentFittingDocumentView
                                    Document={d}
                                    PanelWidth={this.previewdoc[WidthSym]}
                                    PanelHeight={this.previewdoc[HeightSym]}
                                    DataDocument={this.dataDoc}
                                    fieldKey={this.props.fieldKey}
                                    renderDepth={this.props.renderDepth}
                                    ruleProvider={this.props.ruleProvider}
                                    fitToBox={this.props.fitToBox}
                                    onClick={this.props.onClick}
                                    getTransform={this.getTransform}
                                    focus={this.props.focus}
                                    CollectionDoc={this.props.CollectionView && this.props.CollectionView.props.Document}
                                    CollectionView={this.props.CollectionView}
                                    addDocument={this.props.addDocument}
                                    moveDocument={this.props.moveDocument}
                                    removeDocument={this.props.removeDocument}
                                    active={this.props.active}
                                    whenActiveChanged={this.props.whenActiveChanged}
                                    addDocTab={this.props.addDocTab}
                                    pinToPres={this.props.pinToPres}
                                    setPreviewScript={emptyFunction}
                                    previewScript={undefined}></ContentFittingDocumentView>
                            </div> : undefined}

                    </div>
                    <div className="marqueeView" style={{ height: "100%", borderRadius: "inherit", position: "absolute", width: "100%", }} onPointerDown={this.onPointerDown_Dragger}>
                        {<div style={{ transform: `translate(${p[0]}px, ${p[1]}px)` }} >
                            {this._visible ? this.marqueeDiv : null}
                        </div>}
                    </div>
                    {/* <Flyout
                        anchorPoint={anchorPoints.RIGHT_TOP}
                        content={<div>
                            <h5><b>Filter</b></h5>
                            {this.filterbuttons}
                        </div>
                        }>
                        <button id="schemaOptionsMenuBtn" style={{ position: "fixed" }}><FontAwesomeIcon style={{ color: "white" }} icon="cog" size="sm" /></button>
                    </Flyout> */}
                    <div onPointerDown={this.onPointerDown_Dragger} style={{ top: "0px", height: "100%", width: "100%", transform: `translateX(${-this.leftbound * this.nodeoffset}px)`, }}>
                        {this.rowval.map((value, i) => i === Math.round(this.rowval.length / 2) ? (<div onPointerDown={this.onPointerDown_AdjustScale} style={{ cursor: "n-resize", height: "5px", position: "absolute", top: this.rowval[Math.round(this.rowval.length / 2)], width: "10000%", zIndex: 100 }} />) :
                            (<div onPointerDown={this.rowPrev ? this.onPointerDown_AdjustScale : undefined} style={{ cursor: this.rowPrev ? "n-resize" : "", borderTop: this.rowPrev ? "1px black dashed" : "", height: "5px", position: "absolute", top: value, width: "100%", zIndex: 100 }} />))}
                        {this.thumbnails.map(node =>
                            <Thumbnail
                                key={node.doc[Id]}
                                scale={this.rowscale}
                                transform={this.nodeoffset}
                                scrollTop={document.body.scrollTop}
                                renderDepth={this.props.renderDepth}
                                CollectionView={this.props.CollectionView}
                                active={this.props.active}
                                whenActiveChanged={returnFalse}
                                addDocTab={this.props.addDocTab}
                                pinToPres={this.props.pinToPres}
                                createportal={(undefined)}
                                leftval={node.horizontalPos}
                                doc={node.doc}
                                sortstate={this.currentSortingKey}
                                top={this.rowval[node.row]}
                                transition={this.transtate}
                                toggleopac={BoolCast(this.opac)}
                                timelineTop={this.rowval[Math.round(this.rowval.length / 2)]}
                                select={node.select ? node.select : false}
                                update={this.update}
                                range={this._range}
                                rangeval={this.toggle_tick_numbers}
                                sethover={this.sethoverdoc}
                                timelinedoc={this.props.Document}
                            />
                        )
                        }
                        {this.markerDocs.map(d => this.createmarker(d as Doc))}
                        <div onPointerDown={this.onPointerDown_Timeline} style={{
                            position: "absolute", top: this.rowval[Math.round(this.rowval.length / 2)], height: this.rowscale, width: "10000%", borderTop: "1px solid black"
                        }}>
                            {this.tickvals.map((t) => this.callback(t))}
                        </div>
                    </div>
                </div >
                {
                    this.previewflag && <div ref={this.barref} className="backdropscroll" onPointerDown={this.onPointerDown_OffBar} style={{ zIndex: 99, height: "50px", bottom: "0px", width: "100%", position: "fixed", }}>
                        {this.thumbnails.map(item => <div
                            style={{
                                position: "absolute",
                                background: "black",
                                zIndex: 90,
                                top: "25%", left: item.mapleft + "px", width: "5px", border: "3px solid"
                            }}>
                        </div>)}
                        <div className="v1" onPointerDown={this.onPointerDown_LeftBound} style={{ cursor: "ew-resize", position: "absolute", zIndex: 100, left: this.leftbound, height: "100%" }}></div>
                        <div className="v2" onPointerDown={this.onPointerDown2_RightBound} style={{ cursor: "ew-resize", position: "absolute", left: this.props.PanelWidth() - this.rightbound, height: "100%", zIndex: 100 }}></div>
                        <div className="bar" onPointerDown={this.onPointerDown_OnBar} style={{ zIndex: 2, left: this.leftbound, width: this.barwidth - this.rightbound - this.leftbound, height: "100%", position: "absolute" }}>
                        </div>
                    </div>
                }
            </div >
        );
    }
}