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
import { faFilePowerpoint, faShower, faVideo, faThumbsDown, faPlus, faBreadSlice } from "@fortawesome/free-solid-svg-icons";
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

    constructor(props: SubCollectionViewProps) {
        super(props);
        this.helper.bind(this);
    }

    componentDidMount() {
        window.addEventListener("pointerdown", this.handlePointerFromWindow);
        this.helper();
        runInAction(() => this.height = 3);
    }

    @action
    helper = () => {
        // do something
    }

    handlePointerFromWindow = (e: PointerEvent) => {
        console.log(e);
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
        this.preview5 = -2;
    }

    @observable
    private preview: Doc | undefined;

    @observable
    private preview2: Doc | undefined;

    @observable
    private preview3: string;
    @observable
    private preview4: string;
    @observable
    private preview5: String | number | Date;
    @observable
    private preview6: number = -2;
    private selections: (HTMLElement | null)[] = [];

    private leftselect = -2;
    private nameselect = "";


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
        this._visible = false;
    }


    @action
    sonPointerDown = (e: React.PointerEvent): void => {

        if (!e.ctrlKey) {
            for (let i = 0; i < this.buttons.length; i++) {
                console.log(i);
                let button = document.getElementById("button" + String(i));
                button.classList.toggle("selected", false);
                button.classList.toggle("unselected", true);
                document.getElementById("header" + String(i)).classList.toggle("selection", false);
                document.getElementById("header" + String(i)).classList.toggle("unselection", true);

            }
            this.selections = [];
            this.newselect = [];
            console.log("itworked?", this.selections, this.selections.length);
        }
        console.log(this.selections);
        if (e.pageY > (document.body.clientHeight * 0.6)) {
            if (e.pageY < (document.body.clientHeight * 0.79)) {
                this._downX = this._lastX = e.pageX;
                this._downY = this._lastY = e.pageY;
                console.log(this._downX);
                console.log(this._downY);
                this._commandExecuted = false;
                PreviewCursor.Visible = false;

                //if (!this.props.container.props.active()) this.props.selectDocuments([this.props.container.props.Document]);
                document.addEventListener("pointermove", this.sonPointerMove, true);
                document.addEventListener("pointerup", this.sonPointerUp, true);
                if (e.altKey) {
                    //e.stopPropagation(); // bcz: removed so that you can alt-click on button in a collection to switch link following behaviors.
                    e.preventDefault();
                }
                // bcz: do we need this?   it kills the context menu on the main collection if !altKey
                // e.stopPropagation();

            }
        }
    }

    @action
    sonPointerMove = (e: PointerEvent): void => {

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
        this.marqueeSelect();


    }

    @action
    sonPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.sonPointerMove, true);
        if (this._visible) {
            if (!e.shiftKey) {
                SelectionManager.DeselectAll(undefined);
            }
        }
        this.cleanupInteractions(true);
        if (e.altKey) {
            e.preventDefault();
        }
        for (let i = 0; i < this.newselect.length; i++) {
            if (!this.selections.includes(this.newselect[i])) {
                this.selections.push(this.newselect[i]);
            }
        }
    }

    @action
    sonClick = (e: React.MouseEvent): void => {
        if (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD &&
            Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD) {
            e.stopPropagation();
            // let the DocumentView stopPropagation of this event when it selects this document
        } else {  // why do we get a click event when the cursor have moved a big distance?
            // let's cut it off here so no one else has to deal with it.
            e.stopPropagation();
        }
    }



    private newselect: (HTMLElement | null)[] = [];


    marqueeSelect() {
        let newselect = [];
        let posInfo = document.getElementById("marquee").getBoundingClientRect();
        let left = posInfo.left;
        let right = posInfo.right;
        let top = posInfo.top;
        let bottom = posInfo.bottom;




        for (let i = 0; i < this.buttons.length; i++) {
            let button = document.getElementById("button" + String(i));
            let buttoninfo = document.getElementById("button" + String(i)).getBoundingClientRect();
            let buttonLeft = buttoninfo.left;
            let buttonRight = buttoninfo.right;

            if (buttonLeft > left && buttonLeft < right) {
                console.log("yeet");
                button.classList.toggle("selected", true);
                button.classList.toggle("unselected", false);
                document.getElementById("header" + String(i)).classList.toggle("selection", true);
                document.getElementById("header" + String(i)).classList.toggle("unselection", false);

                newselect.push(button);
            }
            else if (buttonRight > left && buttonRight < right) {
                console.log("yeet");
                button.classList.toggle("selected", true);
                button.classList.toggle("unselected", false);
                document.getElementById("header" + String(i)).classList.toggle("selection", true);
                document.getElementById("header" + String(i)).classList.toggle("unselection", false);
                newselect.push(button);

            }
            else {
                button.classList.toggle("selected", false);
                button.classList.toggle("unselected", true);
                document.getElementById("header" + String(i)).classList.toggle("selection", false);
                document.getElementById("header" + String(i)).classList.toggle("unselection", true);

            }

            for (let j = 0; j < this.selections.length; j++) {
                if (this.selections[j] === button) {
                    button.classList.toggle("selected", true);
                    button.classList.toggle("unselected", false);
                    document.getElementById("header" + String(i)).classList.toggle("selection", true);
                    document.getElementById("header" + String(i)).classList.toggle("unselection", false);

                }
            }


        }
        this.newselect = newselect;
    }

    @computed
    get marqueeDiv() {
        let v = this.getContainerTransform().transformDirection(this._lastX - this._downX, this._lastY - this._downY);
        return <div className="marquee" id="marquee" style={{ width: `${Math.abs(v[0])}`, height: `${Math.abs(v[1])}`, zIndex: 2000 }} >
            <span className="marquee-legend" />
        </div>;
    }







    @action
    select(e: React.PointerEvent<HTMLDivElement>, d: Doc, i: number) {
        let buttonid: string = "button" + String(i);
        var button = document.getElementById(buttonid);

        if (e.ctrlKey) {
            if (button.classList.contains("selected")) {
                button.classList.toggle("selected", false);
                button.classList.toggle("unselected", true);
                document.getElementById("header" + String(i)).classList.toggle("selection", false);
                document.getElementById("header" + String(i)).classList.toggle("unselection", true);

                for (let i = 0; i < this.selections.length; i++) {
                    if (this.selections[i] === button) {
                        this.selections.splice(i, 1);
                    }
                }
            }
            else {
                button.classList.toggle("selected", true);
                button.classList.toggle("unselected", false);
                document.getElementById("header" + String(i)).classList.toggle("selection", true);
                document.getElementById("header" + String(i)).classList.toggle("unselection", false);

                this.selections.push(button);
            }
        }

        else {

            if (button.classList.contains("selected")) {
                for (let j = 0; j < this.selections.length; j++) {
                    this.selections[j].classList.toggle("selected", false);
                    this.selections[j].classList.toggle("unselected", true);

                }
                for (let j = 0; j < this.buttonheaders.length; j++) {
                    document.getElementById("header" + String(j)).classList.toggle("selection", false);
                    document.getElementById("header" + String(j)).classList.toggle("unselection", true);
                }


                this.selections = [];
            }
            else {
                for (let j = 0; j < this.selections.length; j++) {
                    this.selections[j].classList.toggle("selected", false);
                    this.selections[j].classList.toggle("unselected", true);
                }
                for (let j = 0; j < this.buttonheaders.length; j++) {
                    document.getElementById("header" + String(j)).classList.toggle("selection", false);
                    document.getElementById("header" + String(j)).classList.toggle("unselection", true);
                }

                button.classList.toggle("selected", true);
                button.classList.toggle("unselected", false);
                document.getElementById("header" + String(i)).classList.toggle("selection", true);
                document.getElementById("header" + String(i)).classList.toggle("unselection", false);

                this.selections = [];
                this.selections.push(button);
            }
        }

        console.log(this.selections);
        this.show(d, i);

    }

    @action
    show(d: Doc, i: number) {
        let buttonid: string = "button" + String(i);
        var button = document.getElementById(buttonid);
        this.preview = d;
        this.preview2 = Docs.KVPDocument(d, {});
        this.preview3 = document.title + "";
        if (this.sortstate === "creationDate") {
            this.preview4 = this.sortstate + ":" + d.creationDate.date;
        }
        else {
            this.preview4 = this.sortstate + ":" + d[this.sortstate];
        }

        if (button.className === "selected") {
            this.leftselect = i;
            this.nameselect = d.title;
            this.overlapingdudes = this.overlapingdudes2[i];

        }
        else {
            this.leftselect = -2;
        }

    }
    private overlapingdudes: JSX.Element[] = [];
    private overlapingdudes2: JSX.Element[][] = [];
    @action
    updateleft(num: number, value: String | number | Date) {
        if (this.preview6 === num) {
            this.preview6 = -2;
        }
        else {
            this.preview6 = num;

        }
        this.preview5 = value;
    }

    @action
    resetLeft() {
        this.preview6 = -2;
    }

    private _values: (String | number | Date)[] = [];
    private ticks: JSX.Element[] = [];
    public buttons: JSX.Element[] = [];
    private buttonheaders: JSX.Element[] = [];
    buttonloop() {
        this.buttons = [];
        let buttons2 = [];
        this._range = 1;
        let arr: Doc[] = [];

        this.childDocs.filter(d => !d.isMinimized).map((d, i) => {
            arr.push(d);
        });

        let backup = arr.filter(doc => doc[this.sortstate]);
        let keyvalue: { doc: Doc, value: String | number | Date }[] = [];

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
        this.buttonheaders = [];

        for (let i = 0; i < backup.length; i++) {
            let color = "$dark-color";
            let icon = this.checkData(backup[i]);

            leftval = (((values[i] - values[0]) * this.barwidth * 0.97 / this._range) * (this.barwidth / (this.barwidth - this.xmovement2 - this.xmovement)) - (this.xmovement * (this.barwidth) / (this.barwidth - this.xmovement2 - this.xmovement))) + "px";
            let display = (e: React.PointerEvent<HTMLDivElement>) => { this.select(e, keyvalue[i].doc, i); this.resetLeft(); };
            let leftval2 = (((values[i] - values[0]) * this.barwidth * 0.97 / this._range) * (this.barwidth / (this.barwidth - this.xmovement2 - this.xmovement)) - (this.xmovement * (this.barwidth) / (this.barwidth - this.xmovement2 - this.xmovement)));
            let overlap = false;
            let thingies = [];
            for (let j = 0; j < backup.length; j++) {
                if (j !== i) {
                    if (values[i] === values[j]) {
                        icon = faPlus;
                        display = (e: React.PointerEvent<HTMLDivElement>) => { this.select(e, keyvalue[i].doc, i); this.updateleft(i, values[i]); };
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
            if (overlap === false) {
                this.buttons.push(
                    <div onClick={display} style={{ position: "absolute", left: leftval, width: "100px", height: "100px" }}>
                        <div className="unselected" id={"button" + String(i)} style={{ position: "absolute", width: "100px", height: "100px", pointerEvents: "all" }}>
                            {this.documentpreview(docs[i])}
                        </div>
                    </div>);
            }
            else {
                this.buttons.push(
                    <div onClick={display} style={{ position: "absolute", left: leftval, width: "100px", height: "100px" }}>
                        <div className="unselected" id={"button" + String(i)} style={{ position: "absolute", overflow: "scroll", background: "grey", width: "100px", height: "100px", zIndex: 0 }}>
                            {thingies}
                        </div>
                    </div>);
            }

            this.buttonheaders.push(
                <div className="unselection" id={"header" + String(i)} onClick={this.sonClick} onPointerDown={this.sonPointerDown} style={{
                    whiteSpace: "nowrap", borderRadius: "5px 5px 0px 0px", border: "1px",
                    textOverflow: "ellipsis", overflow: "hidden", paddingLeft: "3px", paddingRight: "3px", paddingTop: "3px", top: "-28px", zIndex: 99, position: "absolute", left: leftval, width: "100px", height: "30px"
                }}>
                    {docs[i].title}
                </div>
            );

            buttons2.push(
                <div
                    style={{
                        position: "absolute",
                        background: "black",
                        zIndex: "1",
                        top: "50%", left: ((values[i] - values[0]) * this.barwidth / this._range) * 0.97 + "px", width: "5px", border: "3px solid"
                    }}>
                </div>);
        }

        this.overlapingdudes2 = overlaps;

        let checkvalue = this.preview5;
        let filtered = keyvalue.filter(function (keyvalue) {
            if (keyvalue.value === checkvalue) {
                return keyvalue;
            }
        });



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


        return (<div id="screen" >
            <div style={{ position: "absolute", height: "60%", width: "20%", overflow: "scroll", border: "1px solid" }}>
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
            <div style={{ top: "86%", height: "8%", width: "100%", position: "absolute" }}>
                <div className="contextMenu" style={{ width: "20%" }}> Min:
                <input value={this.searchString2} onChange={this.onChange2} onKeyPress={this.enter2} type="text" placeholder={String((this.xmovement * this._range / this.barwidth) + this._values[0])}
                        className="searchBox-barChild searchBox-input" />
                </div>
                <div className="contextMenu" style={{ textAlign: "center" }}>{this.preview4}
                </div>


                <div className="contextMenu" style={{ right: "0%", position: "absolute" }}>Max:
                <input value={this.searchString} onChange={this.onChange} onKeyPress={this.enter} type="text" placeholder={String(((this.barwidth - this.xmovement2) * this._range / this.barwidth) + this._values[0])}
                        className="searchBox-barChild searchBox-input" />
                </div>

            </div>
            {/*<div className="selection" style={{
                whiteSpace: "nowrap", borderRadius: "5px 5px 0px 0px", border: "1px",
                textOverflow: "ellipsis", overflow: "hidden", paddingLeft: "3px", paddingRight: "3px", paddingTop: "3px", top: String(document.body.clientHeight * 0.65 - 56) + "px", zIndex: 99, position: "absolute", left: (this.leftselect !== -2 ? (((values[this.leftselect] - values[0]) * this.barwidth * 0.97 / this._range) * (this.barwidth / (this.barwidth - this.xmovement2 - this.xmovement)) - (this.xmovement * (this.barwidth) / (this.barwidth - this.xmovement2 - this.xmovement))) + "px" : "-9999px"), width: "100px", height: "30px"
            }}>
                {(this.nameselect)}
        </div>*/}
            <div className="viewpanel" style={{ top: "5%", position: "absolute", right: "10%", bottom: "35%", background: "#GGGGGG", zIndex: -55, }}></div>
            <div style={{ height: "100%", position: "absolute", width: "100%", }}>
                <div className="marqueeView" style={{ borderRadius: "inherit" }} onClick={this.sonClick} onPointerDown={this.sonPointerDown}>
                    <div style={{ position: "relative", transform: `translate(${p[0]}px, ${p[1]}px)` }} >
                        {this._visible ? this.marqueeDiv : null}
                        <div ref={this._mainCont} style={{ transform: `translate(${-p[0]}px, ${-p[1]}px)` }} >
                            {this.props.children}
                        </div>
                    </div>
                </div>
            </div>
            <div style={{ top: "65%", position: "absolute", bottom: "25%" }}>{this.buttons}{this.buttonheaders}</div>
            <div id="bar" className="backdropscroll" onPointerDown={this.onPointerDown4} style={{ top: "80%", width: "100%", bottom: "15%", position: "absolute", }}>
                {buttons2}
                <div className="v1" onPointerDown={this.onPointerDown} style={{ cursor: "ew-resize", position: "absolute", zIndex: 2, left: this.xmovement, height: "100%" }}>

                </div>
                <div className="v2" onPointerDown={this.onPointerDown2} style={{
                    cursor: "ew-resize",
                    position: "absolute", right: this.xmovement2,
                    height: "100%",
                    zIndex: 2
                }}>
                </div>
                <div className="bar" onPointerDown={this.onPointerDown3} style={{ left: this.xmovement, width: this.barwidth - this.xmovement2 - this.xmovement, height: "100%", position: "absolute" }}>
                </div>
                <Measure onResize={() => this.updateWidth()}>
                    {({ measureRef }) => <div ref={measureRef}> </div>}
                </Measure>


            </div>
        </div >
        );

    }



    private getContainerTransform = (): Transform => this.props.ScreenToLocalTransform().translate(-this.borderWidth, -this.borderWidth);

    @computed get nativeWidth() { return this.Document.nativeWidth || 0; }
    @computed get nativeHeight() { return this.Document.nativeHeight || 0; }
    public get isAnnotationOverlay() { return this.props.fieldKey && this.props.fieldKey === "annotations"; }
    private get borderWidth() { return this.isAnnotationOverlay ? 0 : COLLECTION_BORDER_WIDTH; }
    private panX = () => this.Document.panX || 0;
    private panY = () => this.Document.panY || 0;
    private zoomScaling = () => this.Document.scale || 1;
    private centeringShiftX = () => 0;  // shift so pan position is at center of window for non-overlay collections
    private centeringShiftY = () => 0;// shift so pan position is at center of window for non-overlay collections

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
    onPointerDown = (e: React.PointerEvent): void => {
        console.log(this.barwidth);
        document.addEventListener("pointermove", this.onPointerMove);
        e.stopPropagation();
        e.preventDefault();
    }

    @action
    onPointerDown2 = (e: React.PointerEvent): void => {
        document.addEventListener("pointermove", this.onPointerMove2);
        e.stopPropagation();
        e.preventDefault();
    }

    @action
    onPointerDown3 = (e: React.PointerEvent): void => {
        document.body.style.cursor = "grabbing";

        document.addEventListener("pointermove", this.onPointerMove3);
        e.stopPropagation();
        e.preventDefault();

    }

    @action
    onPointerDown4 = (e: React.PointerEvent): void => {

        let temp = this.barwidth - this.xmovement2 - this.xmovement;
        this.xmovement = e.pageX - document.body.clientWidth + document.getElementById('screen').clientWidth;
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
        this.barwidth = (document.getElementById('bar') ? document.getElementById('bar').clientWidth : (952));
    }

    @observable
    private barwidth = (document.getElementById('bar') ? document.getElementById('bar').clientWidth : (952));


    @observable
    private xmovement = 0;

    @observable
    private xmovement2 = 0;



    @action
    onPointerMove = (e: PointerEvent): void => {
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
        let counter = 0;


    }

    @action
    onPointerMove2 = (e: PointerEvent): void => {
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
    onPointerMove3 = (e: PointerEvent): void => {
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
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointermove", this.onPointerMove2);
        document.removeEventListener("pointermove", this.onPointerMove3);
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


import { PreviewCursor } from "../PreviewCursor";
import "./collectionFreeForm/MarqueeView.scss";
