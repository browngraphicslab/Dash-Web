import React = require("react");
import { observer } from "mobx-react";
import { action, computed, observable, untracked, runInAction, IReactionDisposer, reaction, } from "mobx";
import { Doc, DocListCast, Field, FieldResult, DocListCastAsync, Opt, HeightSym, WidthSym, } from "../../../new_fields/Doc";
import { NumCast, Cast, StrCast, BoolCast } from "../../../new_fields/Types";
import { emptyFunction, Utils, returnOne, returnEmptyString } from "../../../Utils";
import { SelectionManager } from "../../util/SelectionManager";
import { DocumentView } from "../nodes/DocumentView";
import "./CollectionTimelineView.scss";
import { CollectionSubView, SubCollectionViewProps } from "./CollectionSubView";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { DateField } from "../../../new_fields/DateField";
import { List } from "../../../new_fields/List";
import { Transform } from "../../util/Transform";
import { faFilePdf, faFilm, faFont, faGlobeAsia, faImage, faMusic, faObjectGroup, faBell } from '@fortawesome/free-solid-svg-icons';
import { RichTextField, ToPlainText, FromPlainText } from "../../../new_fields/RichTextField";
import { ImageField, VideoField, AudioField, PdfField, WebField } from "../../../new_fields/URLField";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { Docs, DocUtils } from "../../documents/Documents";
import { ProxyField } from "../../../new_fields/Proxy";
import Measure from "react-measure";
import { EditableView } from "../EditableView";
import { listSpec } from "../../../new_fields/Schema";
import { BottomUI } from "./CollectionTimeLineViewBottomUI";
import { anchorPoints, Flyout } from "../DocumentDecorations";
import { Thumbnail, NodeProps } from "./CollectionTimeLineViewNode";
import { undoBatch, UndoManager } from "../../util/UndoManager";


type DocTuple = {
    doc: Doc,
    value: any,
};

type MarkerUnit = {
    document: Doc,
    element: JSX.Element,
    ref: HTMLDivElement | undefined,
    map: JSX.Element,
    mapref: HTMLDivElement | undefined;
    linkedthumbnail: Node | undefined;
};

type Node = {
    doc: Doc;
    leftval: number;
    top: number;
    mapleft: number;
};

@observer
export class CollectionTimelineView extends CollectionSubView(doc => doc) {
    @observable private sortstate: string = "x";
    private _range = 0;
    private screenref = React.createRef<HTMLDivElement>();
    private barref = React.createRef<HTMLDivElement>();
    private marqueeref = React.createRef<HTMLDivElement>();
    private timelineref = React.createRef<HTMLDivElement>();
    private sortReactionDisposer: IReactionDisposer | undefined;
    @observable private types: boolean[] = [];
    @observable pendingThumbnailRefCount = 0;

    @computed
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

    componentWillMount() {
        runInAction(() => {
            for (let i = 0; i < this.filtered.length; i++) {
                this.types[i] = true;
            }
        });
        this.initializeMarkers();
        document.addEventListener("keydown", this.onKeyDown_Selector);
    }

    componentWillUnmount() {
        this.sortReactionDisposer && this.sortReactionDisposer();
    }

    @action
    onKeyDown_Selector = (e: KeyboardEvent | React.KeyboardEvent) => {
        e.preventDefault;
        if (e.altKey) {

        }
        addEventListener("keyup", this.onKeyUp_Selector);
    }

    onKeyUp_Selector = (e: KeyboardEvent | React.KeyboardEvent) => {
        e.preventDefault;
    }

    @action
    initializeMarkers = async () => {
        let markers = this.markerDocs;
        for (let marker of markers) {
            let doc = await marker;
            let markerUnit = { document: doc, ref: undefined, mapref: undefined } as MarkerUnit;
            markerUnit.element = (< div ref={(el) => el ? markerUnit.ref = el : null} onPointerDown={(e) => this.onPointerDown_DeleteMarker(e, String(markerUnit.document.annotation), markerUnit)}
                style={{
                    top: "71%", border: "2px solid" + (markerUnit.document.color),
                    width: "10px", height: "30px", backgroundColor: String(markerUnit.document.color), opacity: 0.5, position: "fixed", left: 0,
                }}></div>);
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
    createmarker = (doc: Doc): JSX.Element | undefined => {
        let markerUnit = { document: doc, ref: undefined, mapref: undefined } as MarkerUnit;
        markerUnit.element = (< div ref={(el) => el ? markerUnit.ref = el : null} onDoubleClick={(e) => this.doubleclick(e, markerUnit)} onPointerDown={(e) => this.onPointerDown_DeleteMarker(e, String(markerUnit.document.annotation), markerUnit)}
            style={{
                border: "2px solid" + String(markerUnit.document.color),
                width: NumCast(doc.initialWidth), height: "30px", top: "-30px", backgroundColor: String(markerUnit.document.color), zIndex: 5, opacity: 0.5, padding: "2px",
                position: "absolute", left: NumCast(doc.initialLeft),
            }}>
            <EditableView
                contents={doc.annotation}
                SetValue={this.annotationUpdate}
                GetValue={() => ""}
                display={"inline"}
                height={30}
                oneLine={true}
            />
        </div>);
        if (markerUnit.document.sortstate === this.sortstate) {
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
            doc.initialLeft = (NumCast(doc.initialLeft) * newscale / NumCast(doc.initialScale)) - newscale * (this.leftbound - NumCast(doc.initialX));
            doc.initialX = this.leftbound;
            doc.initialWidth = (NumCast(doc.initialWidth) * newscale / NumCast(doc.initialScale));
            doc.initialScale = newscale;
        });
    }


    @action
    onPointerDown_DeleteMarker = (e: React.PointerEvent, annotation: string, markerUnit: MarkerUnit): void => {
        if (e.ctrlKey) {
            this.markerDocs.splice(this.markerDocs.indexOf(markerUnit.document), 1);
            this.selectedMarker = undefined;
        }
        else {
            this.selectedMarker ? this.selectedMarker.ref!.style.opacity = "0.5" : null;
            this.selectedMarker ? this.selectedMarker.ref!.style.border = "0px solid black" : null;
            this.selectedMarker = markerUnit;
            this.selectedMarker.ref!.style.opacity = "0.9";
            this.selectedMarker.ref!.style.border = "1px solid black";
            this.selectedMarker.ref!.style.borderStyle = "dashed";
            this.selectedMarker.ref!.style.backgroundColor ? this.selectedColor = this.selectedMarker.ref!.style.backgroundColor : null;
        }

    }

    @action
    doubleclick(e: React.MouseEvent, markerUnit: MarkerUnit) {
        if (markerUnit.ref!.style.border === "1px dashed black") {
            this.leftbound = NumCast(markerUnit.document.initialMapLeft);
            this.rightbound = this.barwidth - NumCast(markerUnit.document.initialMapWidth) - this.leftbound;
        }
        this.markerrender();
    }

    private preventbug: boolean = false;

    onPointerMove_Selector = async (e: PointerEvent) => {
        let doc = await this.markerDocs[this.markerDocs.length - 1];
        if (e.altKey && this.preventbug) {
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


            for (let markers of this.markerDocs) {
                let marker = await markers;
                if (leftval > NumCast(marker.initialLeft!) && leftval < NumCast(marker.initialLeft!) + NumCast(marker.initialWidth!) && this.sortstate === marker.sortstate) {
                    return;
                }
            }
            doc.initialWidth = newwidth;
            doc.initialMapWidth = newmapwidth;
        }
    }

    @action
    onPointerUp_Selector = async (e: PointerEvent) => {
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

    private newselect: (HTMLDivElement | undefined)[] = [];

    @computed
    get marqueeDiv() {
        let v = this.props.ScreenToLocalTransform().translate(0, 0).transformDirection(this._lastX - this._downX, this._lastY - this._downY);
        return <div ref={this.marqueeref} className="marquee" style={{ width: `${Math.abs(v[0])}`, height: `${Math.abs(v[1])}`, zIndex: 2000 }} >
        </div>;

    }
    private _values: number[] = [];
    private ticks: JSX.Element[] = [];
    private thumbnails: Node[] = [];
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

    thumbnailloop() {
        this._range = 1;
        let arr: Doc[] = [];
        //Build an array of all nodes in dash document.
        this.childDocs.map((d) => { arr.push(d); });
        //filter based on selected sort criteria 
        let backup = arr.filter(doc => doc[this.sortstate]);

        let keyvalue: DocTuple[] = [];

        if (backup.length > 0) {
            if (this.sortstate === "creationDate") {
                keyvalue = backup.map(d => {
                    let vdate = Cast(d.creationDate, DateField) as DateField;
                    let value = new Date(vdate.date).getTime();
                    return { doc: d, value: value };
                });
            }
            else if (isNaN(parseFloat(String(backup[0][this.sortstate])))) {
                keyvalue = backup.map(d => {
                    let value = String(d[this.sortstate]);
                    return { doc: d, value: value };
                });
            }
            else {
                keyvalue = backup.map(d => {
                    let value = NumCast(d[this.sortstate]);
                    return { doc: d, value: value };
                });
            }
        }

        keyvalue.sort(function (a, b) { return (a.value - b.value); });
        let docs = keyvalue.map(kv => kv.doc);
        let values = keyvalue.map(kv => kv.value);
        this._range = (values[values.length - 1] - values[0]);
        if (this._range === 0) {
            this._range = values.length;
        }
        if (isNaN(this._range)) {
            this._range = values.length;
            for (let i = 0; i < values.length; i++) {
                values[i] = i;
            }
        }

        this._values = values;
        let leftval = "0";
        this.thumbnails = [];
        runInAction(() => this.pendingThumbnailRefCount = backup.length);
        for (let i = 0; i < backup.length; i++) {
            leftval = ((((this._range * 0.05) + values[i] - values[0]) * this.barwidth / (this._range * 1.1)) * (this.barwidth / (this.barwidth - this.rightbound - this.leftbound)) - (this.leftbound * (this.barwidth) / (this.barwidth - this.rightbound - this.leftbound))) + "px";
            let newNode = {
                mapleft: ((values[i] - values[0] + (this._range * 0.05)) * this.barwidth / (this._range * 1.1)), leftval: parseFloat(leftval), doc: docs[i], top: 20
            } as Node;
            this.thumbnails.push(newNode);
        }
        this.thumbnails = this.filterDocs(this.thumbnails);
        this.adjustY();
    }

    adjustY() {
        for (let thumbnail1 of this.thumbnails) {
            thumbnail1.top = 0;
        }
        let overlap = false;
        while (overlap === false) {
            overlap = true;
            for (let thumbnail1 of this.thumbnails) {
                for (let thumbnail2 of this.thumbnails) {
                    if (((thumbnail1.leftval >= thumbnail2.leftval && thumbnail1.leftval - 50 < thumbnail2.leftval)
                        || (thumbnail1.leftval <= thumbnail2.leftval && thumbnail1.leftval + 50 > thumbnail2.leftval))
                        && (thumbnail1.top === thumbnail2.top)
                        && thumbnail1 !== thumbnail2) {
                        thumbnail1.top += 120;
                        overlap = false;
                    }
                }
            }
        }
    }

    private tickrefs: React.RefObject<HTMLDivElement>[] = [];

    createticks() {
        //Creates the array of tick marks.
        let counter = 0;
        this.ticks = [];
        for (let i = 0; i < this.barwidth; i += this.barwidth / 1000) {
            let leftval = ((i * (this.barwidth / (this.barwidth - this.rightbound - this.leftbound)) - (this.leftbound * (this.barwidth) / (this.barwidth - this.rightbound - this.leftbound))) + "px");
            let tickref = React.createRef<HTMLDivElement>();
            this.tickrefs.push(tickref);
            if (counter % 100 === 0) {
                let val = Math.round(counter * this._range * 1.1 / 1000 + this._values[0] - this._range * 0.05);
                this.ticks.push(<div className="max" ref={tickref} style={{
                    position: "absolute", top: "0%", left: leftval, zIndex: -100, writingMode: "vertical-rl",
                    textOrientation: "mixed",
                }
                }> <div style={{ paddingTop: "10px" }}>{val}</div></div >);
            }
            else if (counter % 50 === 0) { this.ticks.push(<div className="max2" ref={tickref} style={{ position: "absolute", top: "0%", left: leftval, zIndex: -100 }} />); }
            else if (counter % 10 === 0) { this.ticks.push(<div className="active" ref={tickref} style={{ position: "absolute", top: "0%", left: leftval, zIndex: -100 }} />); }
            counter++;
        }
    }

    @observable private selectedMarker: MarkerUnit | undefined;
    @observable private selectedColor: string = "ffff80";

    @action annotationUpdate = (newValue: string) => {
        this.selectedMarker!.document.annotation = newValue;
        return true;
    }

    @observable private barwidth = (this.barref.current ? this.barref.current.clientWidth : (952));
    @observable private leftbound = 0;
    @observable private rightbound = 0;

    @action
    updateWidth() {
        this.barwidth = (this.barref.current ? this.barref.current.clientWidth : (952));
    }

    @action
    leftboundSet = (number: number) => {
        runInAction(() => this.leftbound = number);
        this.markerrender();
    }
    @action
    rightboundSet = (number: number) => { this.rightbound = number; this.markerrender(); }
    selectedColorSet = (color: string) => { this.selectedColor = color; };
    barwidthSet = (color: number) => { this.barwidth = color; this.markerrender(); };

    @action
    setsortsate = (string: string) => {
        this.sortstate = string;
        this.adjustY();

        this.thumbnailloop();
        this.createticks();

    }

    onPointerDown_Dragger = async (e: React.PointerEvent) => {
        let leftval = (e.pageX - document.body.clientWidth + this.screenref.current!.clientWidth);
        let mintick: React.RefObject<HTMLDivElement>;

        let minticknum = 9999999999;
        for (let ticks of this.tickrefs) {
            if (ticks.current !== null) {
                if (Math.abs(leftval - parseFloat(ticks.current.style.left!)) < minticknum) {
                    minticknum = Math.abs(leftval - parseFloat(ticks!.current.style.left!));
                    mintick = ticks;
                }
            }
        }

        if (e.altKey) {
            leftval = parseFloat(mintick!.current!.style.left!);
            for (let markers of this.markerDocs) {
                let marker = await markers;
                if (leftval >= NumCast(marker.initialLeft!) && leftval < NumCast(marker.initialLeft!) + NumCast(marker.initialWidth!) && this.sortstate === marker.sortstate) {
                    return;
                }
            }

            document.addEventListener("pointermove", this.onPointerMove_Selector, true);
            document.addEventListener("pointerup", this.onPointerUp_Selector, true);
            this.preventbug = true;
            e.preventDefault;
            let d = new Doc;
            d.initialLeft = leftval;
            d.firstLeft = leftval;
            d.initialScale = (this.barwidth / (this.barwidth - this.rightbound - this.leftbound));
            d.initialX = this.leftbound;
            d.initialWidth = 10;
            d.initialMapLeft = (((leftval / this.barref.current!.clientWidth)) * (this.barwidth - this.rightbound - this.leftbound)) + this.leftbound;
            d.initialMapWidth = 10;
            d.annotation = "hi";
            d.color = this.selectedColor;
            d.sortstate = this.sortstate;
            this.markerDocs.push(d);
        }

        else {
            document.addEventListener("pointermove", this.onPointerMove_Dragger, true);
            document.addEventListener("pointerup", this.onPointerUp_Dragger, true);
            this.screenref.current!.style.cursor = "grabbing";
        }
    }
    @action
    onPointerMove_Dragger = (e: PointerEvent): void => {
        document.addEventListener("pointerup", this.onPointerUp_Dragger, true);
        if (this.rightbound + e.movementX < 0) {
            this.rightbound = 0;

        }
        else if (this.leftbound - e.movementX < 0) {
            this.leftbound = 0;
        }
        else {
            this.rightbound += e.movementX;
            this.leftbound -= e.movementX;
        }
        this.markerrender();
    }
    onPointerUp_Dragger = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove_Dragger, true);
        document.removeEventListener("pointerup", this.onPointerUp_Dragger, true);
        this.screenref.current!.style.cursor = "grab";
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
        let portal = Docs.Create.FreeformDocument([], { width: 100, height: 100, title: this.props.Document.title + ".portal" });
        //DocUtils.MakeLink(this.props.Document, portal, undefined, this.props.Document.title + ".portal");
        //this.makeBtnClicked();
        this.props.addDocTab && this.props.addDocTab(portal, portal, "onBottom");
    }

    updateDoc(document: Doc, document2: Doc) {
        document = document2;
    }

    render() {
        this.updateWidth();
        this.createticks();
        this.filtermenu();
        this.thumbnailloop();
        let p: [number, number] = this._visible ? this.props.ScreenToLocalTransform().translate(0, 0).transformPoint(this._downX < this._lastX ? this._downX : this._lastX, this._downY < this._lastY ? this._downY : this._lastY) : [0, 0];
        return (
            <div className="collectionTimelineView" onKeyDown={this.onKeyDown_Selector} ref={this.screenref} style={{ overflow: "scroll", cursor: "grab", width: "100%", height: "100%" }} onPointerDown={this.onPointerDown_Dragger} onWheel={(e: React.WheelEvent) => e.stopPropagation()}>
                <Flyout
                    anchorPoint={anchorPoints.RIGHT_TOP}
                    content={<div>
                        <h5><b>Filter</b></h5>
                        {this.filterbuttons}
                    </div>
                    }>
                    <button id="schemaOptionsMenuBtn" style={{ position: "fixed" }}><FontAwesomeIcon style={{ color: "white" }} icon="cog" size="sm" /></button>
                </Flyout>
                <div ref={this.timelineref} className="timeline" style={{ position: "absolute", height: "25px", width: "100%", top: "75%", zIndex: 9999 }}>
                    {DocListCast(this.props.Document.markers).map(d => this.createmarker(d))}
                    {this.ticks}
                </div>
                <BottomUI
                    thumbnailmap={this.thumbnails}
                    markermap={DocListCast(this.props.Document.markers).map(d => this.createmap(d))}
                    leftbound={this.leftbound}
                    rightbound={this.rightbound}
                    leftboundSet={this.leftboundSet}
                    rightboundSet={this.rightboundSet}
                    _range={this._range * 1.1}
                    barwidth={this.barwidth}
                    minvalue={this._values[0] - this._range * 0.05}
                    sortstate={this.sortstate}
                    selectedColor={this.selectedColor}
                    selectedColorSet={this.selectedColorSet}
                    barref={this.barref}
                    barwidthSet={this.barwidthSet}
                    screenref={this.screenref}
                    markerrender={this.markerrender}
                    setsortstate={this.setsortsate}>
                </BottomUI>
                <Measure onResize={() => this.updateWidth()}>
                    {({ measureRef }) => <div ref={measureRef}> </div>}
                </Measure>
                <div className="marqueeView" style={{ height: "40%", top: "60%", borderRadius: "inherit", position: "absolute", width: "100%", }}>
                    {<div style={{ transform: `translate(${p[0]}px, ${p[1] - 0.58 * (document.body.clientHeight)}px)` }} >
                        {this._visible ? this.marqueeDiv : null}
                    </div>}
                </div>
                <div style={{ top: document.body.clientHeight / 6, position: "absolute", bottom: "25%" }}>
                    {this.thumbnails.map(doc =>
                        <Thumbnail
                            scrollTop={document.body.scrollTop}
                            CollectionView={this.props.CollectionView}
                            active={this.props.active}
                            whenActiveChanged={this.props.whenActiveChanged}
                            addDocTab={this.props.addDocTab}
                            pinToPres={this.props.pinToPres}
                            createportal={() => this.makeportal()} leftval={doc.leftval} doc={doc.doc} sortstate={this.sortstate} top={doc.top} timelinetop={this.timelineref.current ? parseFloat(this.timelineref.current!.style.top!) : document.body.clientHeight * 0.75}>
                        </Thumbnail>
                    )}</div>
            </div >
        );
    }
}