import React = require("react");
import { action, computed, IReactionDisposer, reaction, observable, untracked, ObservableMap, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, HeightSym, WidthSym, DocListCast, Opt } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { BoolCast, NumCast, StrCast, Cast, FieldValue, } from "../../../new_fields/Types";
import { emptyFunction, returnOne, Utils, returnFalse } from "../../../Utils";
import { SelectionManager } from "../../util/SelectionManager";
import { undoBatch } from "../../util/UndoManager";
import { DocumentView, DocumentViewProps } from "../nodes/DocumentView";
import { CollectionSchemaPreview } from "./CollectionSchemaView";
import "./CollectionTimelineView.scss";
import { CollectionSubView, SubCollectionViewProps } from "./CollectionSubView";
import { anchorPoints, Flyout } from "../DocumentDecorations";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { DateTimeStep, Point } from "../../northstar/model/idea/idea";
import { date } from "serializr";
import { DateField } from "../../../new_fields/DateField";
import { List } from "../../../new_fields/List";
import { DocumentContentsView, JsxBindings } from "../nodes/DocumentContentsView";
import { Transform } from "../../util/Transform";
import { CollectionView } from "./CollectionView";
import { CollectionPDFView } from "./CollectionPDFView";
import { CollectionVideoView } from "./CollectionVideoView";
import { VideoBox } from "../nodes/VideoBox";
import { faFilePowerpoint, faShower, faVideo, faThumbsDown, faPlus, faBreadSlice, faTintSlash } from "@fortawesome/free-solid-svg-icons";
import { throwStatement, thisTypeAnnotation, JSXElement, jSXAttribute, jSXElement, thisExpression } from "babel-types";
import { faFilePdf, faFilm, faFont, faGlobeAsia, faImage, faMusic, faObjectGroup, faPenNib, faRedoAlt, faTable, faTree, faUndoAlt, faBell } from '@fortawesome/free-solid-svg-icons';
import { RichTextField } from "../../../new_fields/RichTextField";
import { ImageField, VideoField, AudioField, URLField, PdfField, WebField } from "../../../new_fields/URLField";
import { IconField } from "../../../new_fields/IconField";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { Docs } from "../../documents/Documents";
import { HtmlField } from "../../../new_fields/HtmlField";
import { ProxyField } from "../../../new_fields/Proxy";
import { auto, select } from "async";
import Measure from "react-measure";
import { COLLECTION_BORDER_WIDTH } from "../globalCssVariables.scss";
import { CollectionFreeFormView } from "./collectionFreeForm/CollectionFreeFormView";
import { forEach } from "typescript-collections/dist/lib/arrays";

type CompoundValue = String | number | Date;
type DocTuple = {
    doc: Doc,
    value: CompoundValue
};
type MarkerUnit = {
    element: JSX.Element,
    initialLeft: number,
    initialWidth: number,
    initialScaleRef: number
    ref: HTMLDivElement | undefined,
    annotation: string,
    menu: JSXElement,
    menuref: HTMLDivElement | undefined;
};
type Thing = {
    button: JSX.Element,
    buttonref: HTMLDivElement | undefined,

    header: JSX.Element,
    headerref: HTMLDivElement | undefined,

    map: JSX.Element,
    mapref: HTMLDivElement | undefined,
};

export interface FieldViewProps {
    Document?: Doc;
    width: () => number;
    height: () => number;
    CollectionView: CollectionView | CollectionPDFView | CollectionVideoView;
    getTransform: () => Transform;
    addDocument: (document: Doc, allowDuplicates?: boolean) => boolean;
    removeDocument: (document: Doc) => boolean;
    active: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    addDocTab: (document: Doc, where: string) => void;
    setPreviewScript: (script: string) => void;
    previewScript?: string;

}


@observer
class KeyToggle extends React.Component<{ keyName: string, toggle: (key: string) => void }> {
    constructor(props: any) {
        super(props);
    }

    render() {
        return (
            <div key={this.props.keyName}>
                <input type="radio" name="dude" onChange={() => this.props.toggle(this.props.keyName)} />
                {this.props.keyName}
            </div>
        );
    }
}



@observer
export class CollectionTimelineView extends CollectionSubView(doc => doc) {

    @observable
    private sortstate: string = "x";
    private _range = 0;

    private screenref = React.createRef<HTMLDivElement>();
    private barref = React.createRef<HTMLDivElement>();
    private marqueeref = React.createRef<HTMLDivElement>();
    private colorref= React.createRef<HTMLDivElement>();

    componentWillMount() {
        document.addEventListener("keydown", (e) => this.onKeyPress_Selector(e));
    }

    componentWillUnmount() {
        document.removeEventListener("keydown", (e) => this.onKeyPress_Selector(e));
    }



    sortdate(a: Doc, b: Doc) {
        var adate: DateField = a.creationDate;
        var bdate: DateField = b.creationDate;
        return new Date(adate.date) - new Date(bdate.date);
    }

    strcompare = (stringOne: string, stringTwo: string): number => {
        let cur = 0;
        while (cur < stringOne.length && cur < stringTwo.length) {
            if (stringOne[cur] !== stringTwo[cur]) {
                break;
            }
            cur++;
        }
        return stringOne.charCodeAt(cur) - stringTwo.charCodeAt(cur);
    }


    @action
    toggleKey = (key: string) => {
        this.sortstate = key;
    }

    @observable
    private preview: Doc | undefined;

    @observable
    private preview2: Doc | undefined;
    @observable
    private preview4: string;


    private selections: (HTMLDivElement | undefined)[] = [];

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
            document.removeEventListener("pointermove", this.onPointerMove_LeftBound, true);
        }
        this._visible = false;
    }

    private markers: MarkerUnit[] = [];

    @observable
    private countingfriend = 0;

    @computed
    get markerrender() {
        console.log(this.countingfriend);
        this.markers.forEach(element => {
            if (element.ref !== undefined) {
                let oldstyle = element.ref!;
                oldstyle.style.left = String(((element.initialLeft * (this.barwidth / (this.barwidth - this.xmovement2 - this.xmovement)) - (this.xmovement * (this.barwidth) / (this.barwidth - this.xmovement2 - this.xmovement)))));
                oldstyle.style.width = String(element.initialScaleRef * ((this.barwidth / (this.barwidth - this.xmovement2 - this.xmovement))) / element.initialWidth);
            }
        });


        let dudes = this.markers.map(kv => kv.element);

        return (<div>{dudes}</div>);
    }

    @action
    onPointerDown_DeleteMarker = (e: React.PointerEvent, ref: HTMLDivElement | undefined): void => {
        if (e.ctrlKey){
        for (let i = 0; i < this.markers.length; i++) {
            if (this.markers[i].ref === ref) {
                this.markers.splice(i, 1);
            }
        }
        }
    }

    @action
    onPointerDown_Selector = (e: React.PointerEvent): void => {

        if (e.altKey) {
            e.preventDefault;
            let leftval = (e.pageX - document.body.clientWidth + this.screenref.current!.clientWidth/0.98);
            let ting: MarkerUnit = {
                ref: undefined,
                element: <div ref={(el) => el ? ting.ref = el : null} id={"marker" + String(this.markers.length)} onPointerDown={(e) => this.onPointerDown_DeleteMarker(e, ting.ref)} 
                style={{ top: String(document.body.clientHeight * 0.65 + 72), border: "2px solid" + this.selectedColor, 
                width: "10px", height: "30px", backgroundColor: this.selectedColor, opacity: "0.25", position: "absolute", left: leftval }}>
                <input ref={(el) => el ? ting.menuref = el : null} 
                style={{backgroundColor:this.selectedColor, border: "0px solid", width:8 }} type="text"></input></div>,
                initialLeft: (leftval / (this.barwidth / (this.barwidth - this.xmovement2 - this.xmovement))) + (this.xmovement),
                initialScaleRef: 10,
                initialWidth: (this.barwidth / (this.barwidth - this.xmovement2 - this.xmovement)),
                menuref:undefined,
            };

            this.markers.push(ting);
            document.addEventListener("pointermove", this.onPointerMove_Selector, true);
            document.addEventListener("pointerup", this.onPointerUp_Selector, true);
            this.countingfriend += 1;
        }

        else {
            if (!e.ctrlKey) {
                for (let i = 0; i < this.buttons.length; i++) {
                    if (this.buttons[i].buttonref !== undefined) {
                        let button = this.buttons[i].buttonref;
                        button!.classList.toggle("selected", false);
                        button!.classList.toggle("unselected", true);
                        this.buttons[i].headerref!.classList.toggle("selection", false);
                        this.buttons[i].headerref!.classList.toggle("unselection", true);
                    }
                }
                this.selections = [];
                this.newselect = [];
            }
            if (e.pageY > (document.body.clientHeight * 0.6)) {
                if (e.pageY < (document.body.clientHeight * 0.79)) {
                    this._downX = this._lastX = e.pageX;
                    this._downY = this._lastY = e.pageY;

                    this._commandExecuted = false;

                    //if (!this.props.container.props.active()) this.props.selectDocuments([this.props.container.props.Document]);
                    document.addEventListener("pointermove", this.onPointerMove_Selector, true);
                    document.addEventListener("pointerup", this.onPointerUp_Selector, true);
                    if (e.altKey) {
                        //e.stopPropagation(); // bcz: removed so that you can alt-click on button in a collection to switch link following behaviors.
                        e.preventDefault();
                    }
                    // bcz: do we need this?   it kills the context menu on the main collection if !altKey
                    // e.stopPropagation();

                }
            }
        }
    }


    @action
    onPointerMove_Selector = (e: PointerEvent): void => {



        if (e.pageY > document.body.clientHeight * 0.61) {
            if (e.pageY < document.body.clientHeight * 0.79) {
                this._lastY = e.pageY;
            }
            else {
                this._lastY = document.body.clientHeight * 0.79;
            }

        }
        else {
            this._lastY = document.body.clientHeight * 0.61;
        }


        this._lastX = e.pageX;


        if (e.altKey) {
            //let newX= this._lastX- document.body.clientWidth  + this.screenref.current!.clientWidth/0.98;
            if (e.movementX>=0){
            console.log(e.movementX);
            let newX =parseInt(this.markers[this.markers.length - 1].ref.style.width);
            newX += e.movementX;
            console.log(newX);
            console.log(this.markers[this.markers.length - 1]);
            this.markers[this.markers.length - 1].ref.style.width = String(newX);
            this.markers[this.markers.length - 1].menuref.style.width = String(newX)-2;
            this.markers[this.markers.length - 1].initialScaleRef = newX;

        }
            this.countingfriend++;
            e.stopPropagation();


        }


        else {
            this.marqueeSelect();

        }
        if (!e.altKey){
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
        }



    }

    @action
    onPointerUp_Selector = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove_Selector, true);
        if (this._visible) {
            if (!e.shiftKey) {
                SelectionManager.DeselectAll(undefined);
            }
        }
        this.cleanupInteractions(true);
        this.countingfriend++;
        for (let i = 0; i < this.newselect.length; i++) {
            if (!this.selections.includes(this.newselect[i])) {
                this.selections.push(this.newselect[i]);
            }
        }
    }

    @action
    onClick_Selector = (e: React.MouseEvent): void => {
        if (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD &&
            Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD) {
            e.stopPropagation();
            // let the DocumentView stopPropagation of this event when it selects this document
        } else {  // why do we get a click event when the cursor have moved a big distance?
            // let's cut it off here so no one else has to deal with it.
            e.stopPropagation();
        }
    }



    private newselect: (HTMLDivElement | undefined)[] = [];


    marqueeSelect() {
        let newselect = [];
        if (this.marqueeref.current !== null) {
            let posInfo = this.marqueeref.current.getBoundingClientRect();
            let left = posInfo.left;
            let right = posInfo.right;
            for (let i = 0; i < this.buttons.length; i++) {
                if (this.buttons[i].buttonref !== undefined) {
                    let button = this.buttons[i].buttonref;
                    let buttoninfo = button!.getBoundingClientRect();
                    let buttonLeft = buttoninfo.left;
                    let buttonRight = buttoninfo.right;
                    let header = this.buttons[i].headerref;

                    if (buttonLeft > left && buttonLeft < right) {
                        button!.classList.toggle("selected", true);
                        button!.classList.toggle("unselected", false);
                        header!.classList.toggle("selection", true);
                        header!.classList.toggle("unselection", false);

                        newselect.push(button);
                    }
                    else if (buttonRight > left && buttonRight < right) {
                        button!.classList.toggle("selected", true);
                        button!.classList.toggle("unselected", false);
                        header!.classList.toggle("selection", true);
                        header!.classList.toggle("unselection", false);
                        newselect.push(button);

                    }
                    else {
                        button!.classList.toggle("selected", false);
                        button!.classList.toggle("unselected", true);
                        header!.classList.toggle("selection", false);
                        header!.classList.toggle("unselection", true);

                    }

                    for (let j = 0; j < this.selections.length; j++) {
                        if (this.selections[j] === button) {
                            button!.classList.toggle("selected", true);
                            button!.classList.toggle("unselected", false);
                            header!.classList.toggle("selection", true);
                            header!.classList.toggle("unselection", false);

                        }
                    }


                }
            }
        }
        this.newselect = newselect;
    }

    @computed
    get marqueeDiv() {
        let v = this.getContainerTransform().transformDirection(this._lastX - this._downX, this._lastY - this._downY);
        return <div ref={this.marqueeref} className="marquee" style={{ width: `${Math.abs(v[0])}`, height: `${Math.abs(v[1])}`, zIndex: 2000 }} >
        </div>;
    }



    @action
    select(e: React.MouseEvent<HTMLDivElement>, d: Doc, b: HTMLDivElement | undefined, h: HTMLDivElement | undefined, i: number) {
        var button = undefined;
        var header = undefined;
        for (let i = 0; i < this.buttons.length; i++) {
            if (this.buttons[i].buttonref === b) {
                button = (this.buttons[i].buttonref);
                header = this.buttons[i].headerref;
            }
        }

        if (e.ctrlKey) {
            if (button!.classList.contains("selected")) {
                button!.classList.toggle("selected", false);
                button!.classList.toggle("unselected", true);
                header!.classList.toggle("selection", false);
                header!.classList.toggle("unselection", true);

                for (let i = 0; i < this.selections.length; i++) {
                    if (this.selections[i] === button) {
                        this.selections.splice(i, 1);
                    }
                }
            }
            else {
                button!.classList.toggle("selected", true);
                button!.classList.toggle("unselected", false);
                header!.classList.toggle("selection", true);
                header!.classList.toggle("unselection", false);

                this.selections.push(button);
            }
        }

        else {

            if (button!.classList.contains("selected")) {
                for (let j = 0; j < this.selections.length; j++) {
                    this.selections[j]!.classList.toggle("selected", false);
                    this.selections[j]!.classList.toggle("unselected", true);

                }
                for (let j = 0; j < this.buttons.length; j++) {
                    this.buttons[j].headerref!.classList.toggle("selection", false);
                    this.buttons[j].headerref!.classList.toggle("unselection", true);
                }
                this.selections = [];
            }
            else {
                for (let j = 0; j < this.selections.length; j++) {
                    this.selections[j]!.classList.toggle("selected", false);
                    this.selections[j]!.classList.toggle("unselected", true);
                }
                for (let j = 0; j < this.buttons.length; j++) {
                    this.buttons[j].headerref!.classList.toggle("selection", false);
                    this.buttons[j].headerref!.classList.toggle("unselection", true);
                }

                button!.classList.toggle("selected", true);
                button!.classList.toggle("unselected", false);
                header!.classList.toggle("selection", true);
                header!.classList.toggle("unselection", false);

                this.selections = [];
                this.selections.push(button);
            }
        }

        this.show(d);

    }

    @action
    show(d: Doc) {
        this.preview = d;
        this.preview2 = Docs.KVPDocument(d, {});
        if (this.sortstate === "creationDate") {
            this.preview4 = d.creationDate.date;
        }
        else {
            this.preview4 = d[this.sortstate];
        }
    }



    private _values: CompoundValue[] = [];
    private ticks: JSX.Element[] = [];
    private buttons: Thing[] = [];


    buttonloop() {
        this._range = 1;
        let arr: Doc[] = [];

        this.childDocs.filter(d => !d.isMinimized).map((d, i) => {
            arr.push(d);
        });

        let backup = arr.filter(doc => doc[this.sortstate]);
        let keyvalue: DocTuple[] = [];

        if (backup.length > 0) {
            if (this.sortstate === "creationDate") {
                keyvalue = backup.map(d => {
                    let vdate: DateField = d.creationDate;
                    let value = new Date(vdate.date);
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
        let i = values.length - 1;
        this._range = (values[i] - values[0]);
        if (this._range === 0) {
            this._range = values.length;
        }
        if (isNaN(this._range)) {
            this._range = values.length;
            for (let i = 0; i < values.length; i++) {
                values[i] = String(i);
            }
        }

        this._values = values;

        let leftval = "0";
        let overlaps = [];
        this.buttons = [];
        for (let i = 0; i < backup.length; i++) {
            let icon = this.checkData(backup[i]);
            leftval = (((values[i] - values[0]) * this.barwidth * 0.97 / this._range) * (this.barwidth / (this.barwidth - this.xmovement2 - this.xmovement)) - (this.xmovement * (this.barwidth) / (this.barwidth - this.xmovement2 - this.xmovement))) + "px";
            let display = (e: React.MouseEvent<HTMLDivElement>, b: HTMLDivElement | undefined, h: HTMLDivElement | undefined) => { this.select(e, keyvalue[i].doc, b, h, i) };
            let leftval2 = (((values[i] - values[0]) * this.barwidth * 0.97 / this._range) * (this.barwidth / (this.barwidth - this.xmovement2 - this.xmovement)) - (this.xmovement * (this.barwidth) / (this.barwidth - this.xmovement2 - this.xmovement)));
            let overlap = false;
            let thingies = [];
            for (let j = 0; j < backup.length; j++) {
                if (j !== i) {
                    if (values[i] === values[j]) {
                        icon = faPlus;
                        display = (e: React.MouseEvent<HTMLDivElement>, b: HTMLDivElement | undefined, h: HTMLDivElement | undefined) => { this.select(e, keyvalue[i].doc, b, h, i); };
                        overlap = true;
                        thingies.push(
                            <button className="toolbar-button round-button" title="Notifs"
                                onClick={() => this.show(docs[j], j)}
                                style={{
                                    background: "$dark-color",
                                }}>
                                <FontAwesomeIcon icon={this.checkData(docs[j])} size="sm" />
                            </button>
                        );
                    }
                }
            }
            overlaps.push(thingies);
            let newbutton = undefined;

            if (overlap === false) {

                newbutton =
                    <div onClick={(e) => display(e, item.buttonref, item.headerref)} style={{ position: "absolute", left: leftval, width: "100px", height: "100px" }}>
                        <div ref={(el) => el ? item.buttonref = el : null} className="unselected" id={"button" + String(i)} style={{ position: "absolute", width: "100px", height: "100px", pointerEvents: "all" }}>
                            {this.documentpreview(docs[i])}
                        </div>
                    </div>;
            }
            else {
                newbutton =
                    <div ref={(el) => el ? item.buttonref = el : null} onClick={(e) => display(e, item.buttonref, item.headerref)} style={{ position: "absolute", left: leftval, width: "100px", height: "100px" }}>
                        <div className="unselected" id={"button" + String(i)} style={{ position: "absolute", overflow: "scroll", background: "grey", width: "100px", height: "100px", zIndex: 0 }}>
                            {thingies}
                        </div>
                    </div>;
            }


            let item: Thing = {
                button: newbutton,
                buttonref: undefined,
                header: (
                    <div ref={(el) => el ? item.headerref = el : null} className="unselection" id={"header" + String(i)} onClick={this.onClick_Selector} onPointerDown={this.onPointerDown_Selector} style={{
                        whiteSpace: "nowrap", borderRadius: "5px 5px 0px 0px", border: "1px",
                        textOverflow: "ellipsis", overflow: "hidden", paddingLeft: "3px", paddingRight: "3px", paddingTop: "3px", top: "-28px", zIndex: 99, position: "absolute", left: leftval, width: "100px", height: "30px"
                    }}>
                        {docs[i].title}
                    </div>
                ),
                headerref: undefined,
                map: (
                    <div ref={(el) => el ? item.mapref = el : null}
                        style={{
                            position: "absolute",
                            background: "black",
                            zIndex: "1",
                            top: "50%", left: ((values[i] - values[0]) * this.barwidth / this._range) * 0.97 + "px", width: "5px", border: "3px solid"
                        }}>
                    </div>),
                mapref: undefined,
            };
            this.buttons.push(item);
        }



        //Creates the array of tick marks.
        let counter = 0;
        this.ticks = [];
        for (let i = 0; i < this.barwidth; i += this.barwidth / 1000) {
            let leftval = ((i * (this.barwidth / (this.barwidth - this.xmovement2 - this.xmovement)) - (this.xmovement * (this.barwidth) / (this.barwidth - this.xmovement2 - this.xmovement))) + "px");

            if (counter % 100 === 0) {
                this.ticks.push(
                    <div className="max" id={"tick" + String(i)} style={{ position: "absolute", top: "0%", left: leftval, zIndex: -100 }}></div>
                );

            }

            else if (counter % 50 === 0) {
                this.ticks.push(
                    <div className="max2" id={"tick" + String(i)} style={{ position: "absolute", top: "0%", left: leftval, zIndex: -100 }}></div>
                );
            }

            else if (counter % 10 === 0) {
                this.ticks.push(
                    <div className="active" id={"tick" + String(i)} style={{ position: "absolute", top: "0%", left: leftval, zIndex: -100 }}></div>
                );
            }
            else {
                this.ticks.push(
                    <div className="inactive" id={"tick" + String(i)} style={{ position: "absolute", top: "0%", left: leftval, zIndex: -100 }}></div>
                );
            }
            counter++;
        }


        const docs2 = DocListCast(this.props.Document[this.props.fieldKey]);
        let keys: { [key: string]: boolean } = {};
        untracked(() => docs2.map(doc => Doc.GetAllPrototypes(doc).map(proto => Object.keys(proto).forEach(key => keys[key] = false))));
        let p: [number, number] = this._visible ? this.getContainerTransform().transformPoint(this._downX < this._lastX ? this._downX : this._lastX, this._downY < this._lastY ? this._downY : this._lastY) : [0, 0];



        return (<div ref={this.screenref} id="screen" >
            <div style={{ position: "absolute", height: "60%", width: "20%", overflow: "scroll", border: "1px solid", zIndex: 900 }}>
                <div id="schema-options-header"><h5><b>Options</b></h5></div>
                <div id="options-flyout-div">
                    {Array.from(Object.keys(keys)).map(item =>
                        (<KeyToggle key={item} keyName={item} toggle={this.toggleKey} />))}

                </div>
            </div>
            <div className="timeline" style={{ position: "absolute", height: "25px", width: "100%", top: String(document.body.clientHeight * 0.65 + 72) + "px", zIndex: -9999 }}>
                {this.ticks}
            </div>
            <div style={{ left: "20%", width: "50%", height: "60%", position: "absolute", border: "1px solid" }}>
                {this.preview ? this.documentpreview2(this.preview) : (null)}
            </div>
            <div style={{ left: "70%", height: "60%", position: "absolute", border: "1px solid", width: "30%" }}>
                {this.preview2 ? this.documentpreview3(this.preview2) : (null)}
            </div>
            <div className="bottomgrid" style={{ top: "85%", height: "3%", width: "100%", position: "absolute", zIndex: 1000 }}>
                <div className="left"> Min:
                <input value={this.searchString2} onChange={this.onChange2} onKeyPress={this.enter2} type="text" placeholder={String((this.xmovement * this._range / this.barwidth) + this._values[0])}
                        className="searchBox-barChild searchBox-input" />
                </div>
                <div className="mid">
                    <div onClick={(e) => this.toggleColor(e, "ffff80")} className="toggleYellow" style={{ position: "absolute", left: "33%", borderRadius: "12.5px", width: "25px", height: "25px", backgroundColor: "#ffff80" }}></div>
                    <div onClick={(e) => this.toggleColor(e, "bfff80")} className="toggleGreen" style={{ position: "absolute", left: "35%", borderRadius: "12.5px", width: "25px", height: "25px", backgroundColor: "#bfff80" }}></div>
                    <div onClick={(e) => this.toggleColor(e, "#ff8080")} className="toggleRed" style={{ position: "absolute", left: "37%", borderRadius: "12.5px", width: "25px", height: "25px", backgroundColor: "#ff8080" }}></div>
                    
                    <div ref={this.colorref} onClick={(e) => this.toggleColor(e, "#80dfff")} className="toggleBlue" style={{ position: "absolute", left: "39%", borderRadius: "12.5px", width: "25px", height: "25px", backgroundColor: "#80dfff" }}></div>
                    {this.sortstate + ":" + this.preview4}
                </div>
                <div className="right">
                    Max:
                    <input value={this.searchString} onChange={this.onChange} onKeyPress={this.enter} type="text" placeholder={String(((this.barwidth - this.xmovement2) * this._range / this.barwidth) + this._values[0])}
                        className="searchBox-barChild searchBox-input" />
                </div>


            </div>

            <div className="viewpanel" style={{ top: "5%", position: "absolute", right: "10%", bottom: "35%", background: "#GGGGGG", zIndex: -55, }}></div>
            <div style={{ height: "100%", position: "absolute", width: "100%", }} onKeyDown={this.onKeyPress_Selector}>
                <div className="marqueeView" style={{ borderRadius: "inherit" }} onClick={this.onClick_Selector} onPointerDown={this.onPointerDown_Selector}>
                    <div style={{ position: "relative", transform: `translate(${p[0]}px, ${p[1]}px)` }} >
                        {this._visible ? this.marqueeDiv : null}
                    </div>
                </div>
            </div>
            <div style={{ top: "65%", position: "absolute", bottom: "25%" }}>{this.buttons.map(item => item.button)}{this.buttons.map(item => item.header)}</div>
            {this.markerrender}
            <div id="bar" ref={this.barref} className="backdropscroll" onPointerDown={this.onPointerDown_OffBar} style={{ top: "80%", width: "100%", bottom: "15%", position: "absolute", }}>
                {this.buttons.map(item => item.map)}
                <div className="v1" onPointerDown={this.onPointerDown_LeftBound} style={{ cursor: "ew-resize", position: "absolute", zIndex: 2, left: this.xmovement, height: "100%" }}>

                </div>
                <div className="v2" onPointerDown={this.onPointerDown2_RightBound} style={{
                    cursor: "ew-resize",
                    position: "absolute", right: this.xmovement2,
                    height: "100%",
                    zIndex: 2
                }}>
                </div>
                <div className="bar" onPointerDown={this.onPointerDown_OnBar} style={{ left: this.xmovement, width: this.barwidth - this.xmovement2 - this.xmovement, height: "100%", position: "absolute" }}>
                </div>
                <Measure onResize={() => this.updateWidth()}>
                    {({ measureRef }) => <div ref={measureRef}> </div>}
                </Measure>


            </div>
        </div >
        );

    }


    @observable
    private selectedColor: string;

    @action
    toggleColor = (e: React.MouseEvent<HTMLDivElement>, color: string) => {
        this.selectedColor = color;
        this.colorref.current.style.border="2px solid" + color;
    }

    @action
    onKeyPress_Selector = (e: React.KeyboardEvent) => {
        //make textbox and add it to this collection
        //e.preventDefault();
        if (e.altKey) {
            let min = 9999999;
            let max = -999999;

            for (let i = 0; i < this.selections.length; i++) {
                min = this.selections[i].getBoundingClientRect().left < min ? this.selections[i].getBoundingClientRect().left : min;
                max = this.selections[i].getBoundingClientRect().right > max ? this.selections[i].getBoundingClientRect().right : max;

            }
            let ting: MarkerUnit = {
                element: <div ref={(el) => el ? ting.ref = el : null} onPointerDown={(e) => this.onPointerDown_DeleteMarker(e, ting.ref)} id={"marker" + String(this.markers.length)} style={{ top: String(document.body.clientHeight * 0.65 + 72), border: "2px solid" + this.selectedColor, height: "30px", backgroundColor: this.selectedColor, opacity: "0.25", width: Math.abs(max - min), position: "absolute", left: min - document.body.clientWidth -3 + this.screenref.current!  .clientWidth/0.98 }}></div>,
                initialLeft: ((min -3 - document.body.clientWidth + this.screenref.current!.clientWidth/0.98) / (this.barwidth / (this.barwidth - this.xmovement2 - this.xmovement))) + (this.xmovement),
                initialScaleRef: Math.abs(max - min),
                initialWidth: (this.barwidth / (this.barwidth - this.xmovement2 - this.xmovement)),
                ref: undefined,
            };
            this.markers.push(ting);
            this.countingfriend++;
        }
        this.countingfriend++;
    }


    private getContainerTransform = (): Transform => this.props.ScreenToLocalTransform().translate(0, 0);


    @action.bound
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        this.searchString = e.target.value;

    }

    @action.bound
    onChange2(e: React.ChangeEvent<HTMLInputElement>) {
        this.searchString2 = e.target.value;

    }

    @action
    enter = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            var thing = (parseFloat(this.searchString) - parseFloat(this._values[0])) * this.barwidth / this._range;
            if (!isNaN(thing)) {
                if (thing > this.barwidth) {
                    this.xmovement2 = 0;
                }

                else if (this.barwidth - thing <= this.xmovement) {
                    this.xmovement2 = this.barwidth - this.xmovement - 1;
                }

                else {
                    this.xmovement2 = this.barwidth - thing;
                }
                this.searchString = "";
            }
        }
        if (e.keyCode === 9) {
            e.preventDefault;
            e.stopPropagation();

        }
    }

    @action
    enter2 = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            var thing = (parseFloat(this.searchString2) - parseFloat(this._values[0])) * this.barwidth / this._range;
            if (!isNaN(thing)) {
                if (thing < 0) {
                    this.xmovement = 0;
                }
                else if (thing >= this.barwidth - this.xmovement2) {
                    this.xmovement = this.barwidth - this.xmovement2 - 1;
                }
                else {
                    this.xmovement = thing;
                }
            }
            this.searchString2 = "";
        }
        if (e.keyCode === 9) {
            e.preventDefault;
            e.stopPropagation();

        }
    }

    @observable
    searchString: string = "";

    @observable
    searchString2: string = "";


    @action
    checkData = (document: Doc): IconProp => {
        let field = document.data;
        if (field instanceof AudioField) {
            return faMusic;
        }
        else if (field instanceof PdfField) {
            return faFilePdf;
        }
        else if (field instanceof RichTextField) {
            return faFont;
        }
        else if (field instanceof ImageField) {
            return faImage;
        }
        else if (field instanceof VideoField) {
            return faFilm;
        }
        else if (field instanceof WebField) {
            return faGlobeAsia;
        }
        else if (field instanceof ProxyField) {
            return faObjectGroup;
        }
        return faBell;
    }




    documentpreview(d: Doc) {
        return (
            <div>
                <FontAwesomeIcon icon={this.checkData(d)} size="sm" style={{ position: "absolute" }} />
                <div className="window" style={{ pointerEvents: "none", zIndex: 10, width: "94px", height: "94px", position: "absolute" }}></div>
                <div className="window" style={{ background: "white", pointerEvents: "none", zIndex: -1, position: "absolute", width: "94px", height: "94px" }}>

                    <CollectionTimelinePreview
                        Document={d}
                        width={() => 94}
                        height={() => 94}
                        getTransform={() => new Transform(0, 0, 1)}
                        CollectionView={this.props.CollectionView}
                        moveDocument={this.props.moveDocument}
                        addDocument={this.props.addDocument}
                        removeDocument={this.props.removeDocument}
                        active={this.props.active}
                        whenActiveChanged={this.props.whenActiveChanged}
                        addDocTab={this.props.addDocTab}
                    />
                </div>

            </div >



        );
    }

    documentpreview2(d: Doc) {
        return (
            <div>
                <div className="window" style={{ background: "white", pointerEvents: "none", height: "60%", zIndex: 0, position: "absolute", }}>
                    <CollectionTimelinePreview
                        Document={d}
                        width={() => this.barwidth / 2}
                        height={() => 500}
                        getTransform={() => new Transform(0, 0, 1)}
                        CollectionView={this.props.CollectionView}
                        moveDocument={this.props.moveDocument}
                        addDocument={this.props.addDocument}
                        removeDocument={this.props.removeDocument}
                        active={this.props.active}
                        whenActiveChanged={this.props.whenActiveChanged}
                        addDocTab={this.props.addDocTab}
                    />
                </div>

            </div >



        );
    }


    documentpreview3(d: Doc) {
        return (
            <div>
                <div className="window" style={{ background: "white", pointerEvents: "none", height: "100%", zIndex: 0, position: "absolute", }}>
                    <CollectionTimelinePreview
                        Document={d}
                        width={() => this.barwidth * 0.3}
                        height={() => document.body.clientHeight * 0.59}
                        getTransform={() => new Transform(0, 0, 1)}
                        CollectionView={this.props.CollectionView}
                        moveDocument={this.props.moveDocument}
                        addDocument={this.props.addDocument}
                        removeDocument={this.props.removeDocument}
                        active={this.props.active}
                        whenActiveChanged={this.props.whenActiveChanged}
                        addDocTab={this.props.addDocTab}
                    />
                </div>

            </div >



        );
    }




    @action
    onPointerDown_LeftBound = (e: React.PointerEvent): void => {
        document.addEventListener("pointermove", this.onPointerMove_LeftBound);
        this.countingfriend++;

        e.stopPropagation();
        e.preventDefault();
    }

    @action
    onPointerDown2_RightBound = (e: React.PointerEvent): void => {
        document.addEventListener("pointermove", this.onPointerMove_RightBound);
        this.countingfriend++;

        e.stopPropagation();
        e.preventDefault();
    }

    @action
    onPointerDown_OnBar = (e: React.PointerEvent): void => {
        document.body.style.cursor = "grabbing";
        this.countingfriend++;

        document.addEventListener("pointermove", this.onPointerMove_OnBar);
        e.stopPropagation();
        e.preventDefault();

    }

    @action
    onPointerDown_OffBar = (e: React.PointerEvent): void => {
        this.countingfriend++;

        let temp = this.barwidth - this.xmovement2 - this.xmovement;
        this.xmovement = e.pageX - document.body.clientWidth + this.screenref.current!.clientWidth/0.98;
        console.log(e.pageX);
        console.log(document.body.clientWidth)
        console.log(this.screenref.current!.clientWidth);
        console.log(this.xmovement);
        if (this.xmovement < 0) {
            this.xmovement = 0;
        }
        this.xmovement2 = this.barwidth - temp - this.xmovement;
        if (this.xmovement2 < 0) {
            this.xmovement += this.xmovement2;
            this.xmovement2 = 0;
        }
        e.stopPropagation();
        e.preventDefault();
    }

    @action
    updateWidth() {
        this.barwidth = this.barref.current ? this.barref.current.clientWidth : (952);
    }

    @observable
    private barwidth = (this.barref.current ? this.barref.current.clientWidth : (952));


    @observable
    private xmovement = 0;

    @observable
    private xmovement2 = 0;



    @action
    onPointerMove_LeftBound = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();

        let prevx = this.barwidth - this.xmovement2 - this.xmovement;
        this.xmovement += e.movementX;
        if (this.xmovement < 0) {
            this.xmovement = 0;
        }
        if (this.xmovement > this.barwidth - this.xmovement2 - 2) {
            this.xmovement = this.barwidth - this.xmovement2 - 4;
        }
        document.addEventListener("pointerup", this.onPointerUp);


    }

    @action
    onPointerMove_RightBound = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this.xmovement2 -= e.movementX;
        if (this.xmovement2 < 0) {
            this.xmovement2 = 0;
        }
        if (this.xmovement2 > this.barwidth - this.xmovement - 3) {
            this.xmovement2 = this.barwidth - this.xmovement - 3;
        }

        document.addEventListener("pointerup", this.onPointerUp);

    }

    @action
    onPointerMove_OnBar = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this.xmovement2 -= e.movementX;
        this.xmovement += e.movementX;


        if (this.xmovement2 < 0) {
            this.xmovement2 = 0;
            this.xmovement -= e.movementX;
        }
        if (this.xmovement < 0) {
            this.xmovement = 0;
            this.xmovement2 += e.movementX;
        }

        document.addEventListener("pointerup", this.onPointerUp);

    }

    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove_LeftBound);
        document.removeEventListener("pointermove", this.onPointerMove_RightBound);
        document.removeEventListener("pointermove", this.onPointerMove_OnBar);
        document.body.style.cursor = "default";
    }

    render() {
        this.updateWidth();
        return (
            <div className="collectionTimelineView" id="yeet" style={{ marginLeft: "1%", width: "98%", height: "100%" }}
                onWheel={(e: React.WheelEvent) => e.stopPropagation()}>
                {this.buttonloop()}
            </div>
        );
    }
}

interface CollectionTimelinePreviewProps {
    Document?: Doc;
    width: () => number;
    height: () => number;
    CollectionView?: CollectionView | CollectionPDFView | CollectionVideoView;
    getTransform: () => Transform;
    addDocument: (document: Doc, allowDuplicates?: boolean) => boolean;
    moveDocument: (document: Doc, target: Doc, addDoc: ((doc: Doc) => boolean)) => boolean;
    removeDocument: (document: Doc) => boolean;
    active: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    addDocTab: (document: Doc, where: string) => void;

}

@observer
export class CollectionTimelinePreview extends React.Component<CollectionTimelinePreviewProps>{
    private get nativeWidth() { return NumCast(this.props.Document!.nativeWidth, this.props.width()); }
    private get nativeHeight() { return NumCast(this.props.Document!.nativeHeight, this.props.height()); }
    private contentScaling = () => {
        let wscale = this.props.width() / (this.nativeWidth ? this.nativeWidth : this.props.width());
        if (wscale * this.nativeHeight > this.props.height()) {
            return this.props.height() / (this.nativeHeight ? this.nativeHeight : this.props.height());
        }
        return wscale;
    }
    private PanelWidth = () => this.nativeWidth * this.contentScaling();
    private PanelHeight = () => this.nativeHeight * this.contentScaling();
    private getTransform = () => this.props.getTransform().translate(-this.centeringOffset, 0).scale(1 / this.contentScaling());
    get centeringOffset() { return (this.props.width() - this.nativeWidth * this.contentScaling()) / 2; }

    render() {
        return (<div className="collectionSchemaView-previewRegion" style={{ width: this.props.width(), height: "100%" }}>
            {!this.props.Document || !this.props.width ? (null) : (
                <div className="collectionSchemaView-previewDoc" style={{ transform: `translate(${this.centeringOffset}px, 0px)`, height: "100%" }}>
                    <DocumentView Document={this.props.Document} isTopMost={false} selectOnLoad={false}
                        addDocument={this.props.addDocument} moveDocument={this.props.moveDocument}
                        ScreenToLocalTransform={this.getTransform}
                        ContentScaling={this.contentScaling}
                        PanelWidth={this.PanelWidth} PanelHeight={this.PanelHeight}
                        ContainingCollectionView={this.props.CollectionView}
                        focus={emptyFunction}
                        parentActive={this.props.active}
                        whenActiveChanged={this.props.whenActiveChanged}
                        bringToFront={emptyFunction}
                        addDocTab={this.props.addDocTab}
                    />
                </div>)}
        </div>);
    }
}

