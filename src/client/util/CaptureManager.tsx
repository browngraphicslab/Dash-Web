import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { convertToObject } from "typescript";
import { Doc, DocListCast } from "../../fields/Doc";
import { BoolCast, StrCast, Cast } from "../../fields/Types";
import { addStyleSheet, addStyleSheetRule, Utils } from "../../Utils";
import { LightboxView } from "../views/LightboxView";
import { MainViewModal } from "../views/MainViewModal";
import "./CaptureManager.scss";
import { SelectionManager } from "./SelectionManager";
import { undoBatch } from "./UndoManager";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

@observer
export class CaptureManager extends React.Component<{}> {
    public static Instance: CaptureManager;
    static _settingsStyle = addStyleSheet();
    @observable _document: any;
    @observable isOpen: boolean = false; // whether the CaptureManager is to be displayed or not.


    constructor(props: {}) {
        super(props);
        CaptureManager.Instance = this;
    }

    public close = action(() => this.isOpen = false);
    public open = action((doc: Doc) => {
        this.isOpen = true;
        this._document = doc;
    });


    @computed get visibilityContent() {

        return <div className="capture-block">
            <div className="capture-block-title">Visibility</div>
            <div className="capture-block-radio">
                <div className="radio-container">
                    <input type="radio" value="private" name="visibility" style={{ margin: 0, marginRight: 5 }} /> Private
                </div>
                <div className="radio-container">
                    <input type="radio" value="public" name="visibility" style={{ margin: 0, marginRight: 5 }} /> Public
                </div>
            </div>
        </div>;
    }

    @computed get linksContent() {
        const doc = this._document;
        const order: JSX.Element[] = [];
        if (doc) {
            console.log('title', doc.title);
            console.log('links', doc.links);
            const linkDocs = DocListCast(doc.links);
            const firstDocs = linkDocs.filter(linkDoc => Doc.AreProtosEqual(linkDoc.anchor1 as Doc, doc) || Doc.AreProtosEqual((linkDoc.anchor1 as Doc).annotationOn as Doc, doc)); // link docs where 'doc' is anchor1
            const secondDocs = linkDocs.filter(linkDoc => Doc.AreProtosEqual(linkDoc.anchor2 as Doc, doc) || Doc.AreProtosEqual((linkDoc.anchor2 as Doc).annotationOn as Doc, doc)); // link docs where 'doc' is anchor2
            linkDocs.forEach((l, i) => {
                if (l) {
                    console.log(i, (l.anchor1 as Doc).title);
                    console.log(i, (l.anchor2 as Doc).title);
                    order.push(
                        <div className="list-item">
                            <div className="number">{i}</div>
                            {(l.anchor1 as Doc).title}
                        </div>
                    );
                }
            });
        }

        return <div className="capture-block">
            <div className="capture-block-title">Links</div>
            <div className="capture-block-list">
                {order}
            </div>
        </div>;
    }

    @computed get closeButtons() {
        return <div className="capture-block">
            <div className="buttons">
                <div className="save" onClick={() => {
                    LightboxView.SetLightboxDoc(this._document);
                    this.close();
                }}>
                    Save
                </div>
                <div className="cancel" onClick={() => {
                    const selected = SelectionManager.Views().slice();
                    SelectionManager.DeselectAll();
                    selected.map(dv => dv.props.removeDocument?.(dv.props.Document));
                    this.close();
                }}>
                    Cancel
                </div>
            </div>
        </div>;
    }



    private get captureInterface() {
        return <div className="capture-interface">
            <div className="capture-t1">
                <div className="recordButtonOutline" style={{}}>
                    <div className="recordButtonInner" style={{}}>
                    </div>
                </div>
                Conversation Capture
            </div>
            <div className="capture-t2">

            </div>
            {this.visibilityContent}
            {this.linksContent}
            <div className="close-button" onClick={this.close}>
                <FontAwesomeIcon icon={"times"} color="black" size={"lg"} />
            </div>
            {this.closeButtons}
        </div>;

    }

    render() {
        return <MainViewModal
            contents={this.captureInterface}
            isDisplayed={this.isOpen}
            interactive={true}
            closeOnExternalClick={this.close}
            dialogueBoxStyle={{ width: "500px", height: "350px", border: "none", background: "whitesmoke" }}
            overlayStyle={{ background: "black" }}
            overlayDisplayedOpacity={0.6}
        />;
    }
}