import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faBell, faFilePdf, faFilm, faFont, faGlobeAsia, faImage, faMusic, faObjectGroup } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, Opt, WidthSym, HeightSym } from "../../../new_fields/Doc";
import { ProxyField } from "../../../new_fields/Proxy";
import { RichTextField, ToPlainText } from "../../../new_fields/RichTextField";
import { Cast, NumCast, ScriptCast } from "../../../new_fields/Types";
import { AudioField, ImageField, PdfField, VideoField, WebField } from "../../../new_fields/URLField";
import { emptyFunction, returnEmptyString, returnOne, emptyPath, returnFalse } from "../../../Utils";
import { Transform } from "../../util/Transform";
import { CollectionView } from "../collections/CollectionView";
import "./CollectionTimelineView.scss";
import React = require("react");
import { ContentFittingDocumentView } from "../nodes/ContentFittingDocumentView";
import { CompileScript } from "../../util/Scripting";
import { ScriptField } from "../../../new_fields/ScriptField";

export interface NodeProps {
    scale: number;
    leftval: number;
    sortstate: string;
    transform: number;
    doc: Doc;
    top: number;
    renderDepth: number;
    CollectionView: Opt<CollectionView>;
    active: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    addDocTab: (doc: Doc, dataDoc: Doc | undefined, where: string) => boolean;
    pinToPres: (document: Doc) => void;
    scrollTop: number;
    timelineTop: number;
    select: boolean;
    range: number;
    rangeval: boolean;
    timelinedoc: Doc;
}
//Thumbnail class defines the icons used for displaying documents in the ruler view.
@observer
export class
    Thumbnail extends React.Component<NodeProps> {

    //Provides icon based on document type.
    @action
    checkData = (document: Doc): IconProp => {
        const field = document.data;
        if (field instanceof AudioField) { return faMusic; }
        else if (field instanceof PdfField) { return faFilePdf; }
        else if (field instanceof RichTextField) { return faFont; }
        else if (field instanceof ImageField) { return faImage; }
        else if (field instanceof VideoField) { return faFilm; }
        else if (field instanceof WebField) { return faGlobeAsia; }
        else if (field instanceof ProxyField) { return faObjectGroup; }
        return faBell;
    }

    //Display document with document contents view.
    documentDisplay(d: Doc, width: number, height: number) {
        return (<div style={{ width: width, height: height, overflow: "hidden" }}> <ContentFittingDocumentView
            ruleProvider={undefined}
            pinToPres={this.props.pinToPres}
            Document={d}
            LibraryPath={emptyPath}
            renderDepth={this.props.renderDepth + 1}
            PanelWidth={() => width}
            PanelHeight={() => height}
            focus={emptyFunction}
            onClick={this.onChildClickHandler}
            whenActiveChanged={this.props.whenActiveChanged}
            addDocTab={this.props.addDocTab}
            getTransform={Transform.Identity}
            CollectionDoc={this.props.CollectionView?.props.Document}
            CollectionView={this.props.CollectionView}
            moveDocument={returnFalse}
            addDocument={returnFalse}
            removeDocument={returnFalse}
            active={this.props.active}>
        </ContentFittingDocumentView></div>);
    }

    @computed get defaultClickScript() {
        const script = CompileScript("openOnRight(this)", {
            params: { this: Doc.name },
            typecheck: false,
            editable: true,
        });
        return script.compiled ? new ScriptField(script) : undefined;
    }
    @computed get onChildClickHandler() {
        return this.props.CollectionView?.props.Document.onChildClick ? ScriptCast(this.props.CollectionView.props.Document.onChildClick) : this.defaultClickScript;
    }
    //when you click on the thumbnail.
    @action
    toggleSelection(e: React.PointerEvent) {
        this.props.timelinedoc.currdoc = this.props.doc;
        this.props.timelinedoc.currval = this.props.doc[this.props.sortstate];
        this.onChildClickHandler?.script.run({ this: this.props.doc }, console.log);
    }
    //when thumbnail is marquee selected.
    @action
    toggletwo() {
        this.selectclass = !this.selectclass;
    }
    //Handles selection from marquee.
    @computed
    get selectclass() {
        if (this.newclass === undefined) {
            this.newclass = this.props.select;
        }
        else if (this.props.select === true) {
            return true;
        }

        return this.newclass;
    }

    set selectclass(boolean: boolean) {
        this.newclass = boolean;
    }

    @observable newclass: boolean | undefined;

    @observable left: number | undefined;
    //Handles where thumbnail should be placed on screen.
    @computed
    get leftval(): number {
        if (this.left === undefined) {
            this.left = this.props.leftval;
            return this.left;
        }
        return this.left;

    }

    set leftval(number) {
        this.left = number;
    }
    //Displays numerical value of thubmnail on ruler when selected with marquee.
    private calculatepreview() {
        if (!this.props.rangeval) {
            console.log(this.props.doc[this.props.sortstate]);
            return this.props.doc[this.props.sortstate];
        }
        return Math.round(NumCast(this.props.doc[this.props.sortstate]));
    }

    //First half is just the square icon of the document, second (After the "selection class") is extra information when selected by marquee.
    render() {
        return <div>
            <div onPointerDown={(e) => this.toggleSelection(e)} style={{
                zIndex: 1, position: "absolute", left: this.props.leftval * this.props.transform, top: this.props.top, width: this.props.scale, height: this.props.scale,
            }}>
                <div className="unselected" style={{ position: "absolute", zIndex: 11, width: this.props.scale, height: this.props.scale, pointerEvents: "all", overflow: "hidden" }}>
                    <FontAwesomeIcon icon={this.checkData(this.props.doc)} size="sm" style={{ position: "absolute" }} />
                    <div className="window" style={{ pointerEvents: "none", zIndex: 10, position: "absolute" }}>
                        {this.documentDisplay(this.props.doc, this.props.scale - 6, this.props.scale - 6)}
                    </div>
                </div>
            </div>

            <div className={this.selectclass === true ? "selection " : "unselection"} style={{
                zIndex: 98, position: "absolute", height: "100%",
            }}>
                <div style=
                    {{
                        position: "absolute", left: this.props.leftval * this.props.transform, top: "0px", height: "100%", overflow: "hidden", writingMode: "vertical-rl",
                        textOrientation: "mixed", borderLeft: "1px black solid",
                    }} />
                < div style={{
                    position: "absolute", height: this.props.scale, width: this.props.scale, left: this.props.leftval * this.props.transform - this.props.scale, paddingTop: 10, top: this.props.timelineTop, overflow: "hidden", writingMode: "vertical-rl",
                    textOrientation: "mixed",
                }}>{this.calculatepreview()}</div>
            </div>
        </div >;
    }
}