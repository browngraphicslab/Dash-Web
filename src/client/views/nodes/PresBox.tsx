import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faArrowLeft, faArrowRight, faEdit, faMinus, faPlay, faPlus, faStop, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, observable, runInAction, computed } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { listSpec } from "../../../new_fields/Schema";
import { BoolCast, Cast, FieldValue, NumCast } from "../../../new_fields/Types";
import { DocumentManager } from "../../util/DocumentManager";
import { undoBatch } from "../../util/UndoManager";
import { ContextMenu } from "../ContextMenu";
import PresentationElement from "../presentationview/PresentationElement";
import PresentationViewList from "../presentationview/PresentationList";
import "../presentationview/PresentationView.scss";
import { FieldView, FieldViewProps } from './FieldView';
import PresModeMenu from "../presentationview/PresentationModeMenu";
import { CollectionDockingView } from "../collections/CollectionDockingView";

library.add(faArrowLeft);
library.add(faArrowRight);
library.add(faPlay);
library.add(faStop);
library.add(faPlus);
library.add(faTimes);
library.add(faMinus);
library.add(faEdit);

@observer
export class PresBox extends React.Component<FieldViewProps> {
    public static LayoutString(fieldKey?: string) { return FieldView.LayoutString(PresBox, fieldKey); }

    public static Instance: PresBox;
    //mapping from docs to their rendered component
    @observable _presElementsMappings: Map<Doc, PresentationElement> = new Map();
    //variable that holds all the docs in the presentation
    @observable _childrenDocs: Doc[] = [];

    @observable _opacity = 1;
    @observable _persistOpacity = true;
    @observable _labelOpacity = 0;
    // whether presentation view has been minimized
    @observable _presMode = false;
    @observable public static CurrentPresentation: PresBox;

    @computed static get miniPresentation() {
        let next = () => PresBox.CurrentPresentation.next();
        let back = () => PresBox.CurrentPresentation.back();
        let startOrResetPres = () => PresBox.CurrentPresentation.startOrResetPres();
        let closePresMode = action(() => {
            PresBox.CurrentPresentation._presMode = false;
            CollectionDockingView.AddRightSplit(PresBox.CurrentPresentation.props.Document, undefined);
        });
        return !PresBox.CurrentPresentation || !PresBox.CurrentPresentation._presMode ? (null) :
            <PresModeMenu next={next} back={back} presStatus={BoolCast(PresBox.CurrentPresentation.props.Document.presStatus)}
                startOrResetPres={startOrResetPres} closePresMode={closePresMode} />;
    }

    //initilize class variables
    constructor(props: FieldViewProps) {
        super(props);
        runInAction(() => PresBox.CurrentPresentation = this);
    }

    next = async () => {
        const current = NumCast(this.props.Document.selectedDoc);
        //asking to get document at current index
        let docAtCurrentNext = await this.getDocAtIndex(current + 1);
        if (docAtCurrentNext !== undefined) {
            let presDocs = DocListCast(this.props.Document.data);
            let nextSelected = current + 1;

            for (; nextSelected < presDocs.length - 1; nextSelected++) {
                if (!this._presElementsMappings.get(presDocs[nextSelected + 1])!.props.document.groupButton) {
                    break;
                }
            }

            this.gotoDocument(nextSelected, current);
        }
    }
    back = async () => {
        const current = NumCast(this.props.Document.selectedDoc);
        //requesting for the doc at current index
        let docAtCurrent = await this.getDocAtIndex(current);
        if (docAtCurrent !== undefined) {

            //asking for its presentation id.
            let prevSelected = current;
            let zoomOut: boolean = false;

            //checking if this presentation id is mapped to a group, if so chosing the first element in group
            let presDocs = DocListCast(this.props.Document.data);
            let currentsArray: Doc[] = [];
            for (; prevSelected > 0 && presDocs[prevSelected].groupButton; prevSelected--) {
                currentsArray.push(presDocs[prevSelected]);
            }
            prevSelected = Math.max(0, prevSelected - 1);

            //checking if any of the group members had used zooming in
            currentsArray.forEach((doc: Doc) => {
                //let presElem: PresentationElement | undefined = this.presElementsMappings.get(doc);
                if (this._presElementsMappings.get(doc)!.props.document.showButton) {
                    zoomOut = true;
                    return;
                }
            });

            // if a group set that flag to zero or a single element
            //If so making sure to zoom out, which goes back to state before zooming action
            if (current > 0) {
                if (zoomOut || this._presElementsMappings.get(docAtCurrent)!.showButton) {
                    let prevScale = NumCast(this._childrenDocs[prevSelected].viewScale, null);
                    let curScale = DocumentManager.Instance.getScaleOfDocView(this._childrenDocs[current]);
                    if (prevScale !== undefined && prevScale !== curScale) {
                        DocumentManager.Instance.zoomIntoScale(docAtCurrent, prevScale);
                    }
                }
            }
            this.gotoDocument(prevSelected, current);
        }
    }

    /**
     * This is the method that checks for the actions that need to be performed
     * after the document has been presented, which involves 3 button options:
     * Hide Until Presented, Hide After Presented, Fade After Presented
     */
    showAfterPresented = (index: number) => {
        this._presElementsMappings.forEach((presElem, doc) => {
            //the order of cases is aligned based on priority
            if (presElem.props.document.hideTillShownButton) {
                if (this._childrenDocs.indexOf(doc) <= index) {
                    doc.opacity = 1;
                }
            }
            if (presElem.props.document.hideAfterButton) {
                if (this._childrenDocs.indexOf(doc) < index) {
                    doc.opacity = 0;
                }
            }
            if (presElem.props.document.fadeButton) {
                if (this._childrenDocs.indexOf(doc) < index) {
                    doc.opacity = 0.5;
                }
            }
        });
    }

    /**
     * This is the method that checks for the actions that need to be performed
     * before the document has been presented, which involves 3 button options:
     * Hide Until Presented, Hide After Presented, Fade After Presented
     */
    hideIfNotPresented = (index: number) => {
        this._presElementsMappings.forEach((presElem, key) => {
            //the order of cases is aligned based on priority

            if (presElem.props.document.hideAfterButton) {
                if (this._childrenDocs.indexOf(key) >= index) {
                    key.opacity = 1;
                }
            }
            if (presElem.props.document.fadeButton) {
                if (this._childrenDocs.indexOf(key) >= index) {
                    key.opacity = 1;
                }
            }
            if (presElem.props.document.hideTillShownButton) {
                if (this._childrenDocs.indexOf(key) > index) {
                    key.opacity = 0;
                }
            }
        });
    }

    /**
     * This method makes sure that cursor navigates to the element that
     * has the option open and last in the group. If not in the group, and it has
     * te option open, navigates to that element.
     */
    navigateToElement = async (curDoc: Doc, fromDoc: number) => {
        let docToJump = curDoc;
        let willZoom = false;

        let presDocs = DocListCast(this.props.Document.data);
        let nextSelected = presDocs.indexOf(curDoc);
        let currentDocGroups: Doc[] = [];
        for (; nextSelected < presDocs.length - 1; nextSelected++) {
            if (!this._presElementsMappings.get(presDocs[nextSelected + 1])!.props.document.groupButton) {
                break;
            }
            currentDocGroups.push(presDocs[nextSelected]);
        }

        currentDocGroups.forEach((doc: Doc, index: number) => {
            if (this._presElementsMappings.get(doc)!.navButton) {
                docToJump = doc;
                willZoom = false;
            }
            if (this._presElementsMappings.get(doc)!.showButton) {
                docToJump = doc;
                willZoom = true;
            }
        });

        //docToJump stayed same meaning, it was not in the group or was the last element in the group
        if (docToJump === curDoc) {
            //checking if curDoc has navigation open
            if (this._presElementsMappings.get(curDoc)!.navButton) {
                DocumentManager.Instance.jumpToDocument(curDoc, false);
            } else if (this._presElementsMappings.get(curDoc)!.showButton) {
                let curScale = DocumentManager.Instance.getScaleOfDocView(this._childrenDocs[fromDoc]);
                //awaiting jump so that new scale can be found, since jumping is async
                await DocumentManager.Instance.jumpToDocument(curDoc, true);
                curDoc.viewScale = DocumentManager.Instance.getScaleOfDocView(curDoc);

                //saving the scale user was on before zooming in
                if (curScale !== 1) {
                    this._childrenDocs[fromDoc].viewScale = curScale;
                }

            }
            return;
        }
        let curScale = DocumentManager.Instance.getScaleOfDocView(this._childrenDocs[fromDoc]);

        //awaiting jump so that new scale can be found, since jumping is async
        await DocumentManager.Instance.jumpToDocument(docToJump, willZoom);
        let newScale = DocumentManager.Instance.getScaleOfDocView(curDoc);
        curDoc.viewScale = newScale;
        //saving the scale that user was on
        if (curScale !== 1) {
            this._childrenDocs[fromDoc].viewScale = curScale;
        }

    }

    /**
     * Async function that supposedly return the doc that is located at given index.
     */
    getDocAtIndex = async (index: number) => {
        const list = FieldValue(Cast(this.props.Document.data, listSpec(Doc)));
        if (list && index >= 0 && index < list.length) {
            this.props.Document.selectedDoc = index;
            //awaiting async call to finish to get Doc instance
            return await list[index];
        }
        return undefined
    }

    /**
     * The function that removes a doc from a presentation. It also makes sure to
     * do necessary updates to backUps and mappings stored locally.
     */
    @action
    public RemoveDoc = async (index: number) => {
        const value = FieldValue(Cast(this.props.Document.data, listSpec(Doc))); // don't replace with DocListCast -- we need to modify the document's actual stored list
        if (value) {
            //removing the Presentation Element from the document and update mappings
            this._presElementsMappings.delete(await value.splice(index, 1)[0]);
        }
    }

    public removeDocByRef = (doc: Doc) => {
        let indexOfDoc = this._childrenDocs.indexOf(doc);
        const value = FieldValue(Cast(this.props.Document.data, listSpec(Doc)));
        if (value) {
            value.splice(indexOfDoc, 1)[0];
        }
        if (indexOfDoc !== - 1) {
            return true;
        }
        return false;
    }

    //The function that is called when a document is clicked or reached through next or back.
    //it'll also execute the necessary actions if presentation is playing.
    @action
    public gotoDocument = async (index: number, fromDoc: number) => {
        Doc.UnBrushAllDocs();
        const list = FieldValue(Cast(this.props.Document.data, listSpec(Doc)));
        if (list && index >= 0 && index < list.length) {
            this.props.Document.selectedDoc = index;

            if (!this.props.Document.presStatus) {
                this.props.Document.presStatus = true;
                this.startPresentation(index);
            }

            const doc = await list[index];
            if (this.props.Document.presStatus) {
                this.navigateToElement(doc, fromDoc);
                this.hideIfNotPresented(index);
                this.showAfterPresented(index);
            }
        }
    }
    //Function that sets the store of the children docs.
    @action
    setChildrenDocs = (docList: Doc[]) => {
        this._childrenDocs = docList;
    }

    //The function that is called to render the play or pause button depending on
    //if presentation is running or not.
    renderPlayPauseButton = () => {
        return <button title={"Reset Presentation" + this.props.Document.presStatus ? "" : " From Start"} className="presentation-button" onClick={this.startOrResetPres}>
            <FontAwesomeIcon icon={this.props.Document.presStatus ? "stop" : "play"} />
        </button>;
    }

    //The function that starts or resets presentaton functionally, depending on status flag.
    @action
    startOrResetPres = () => {
        if (this.props.Document.presStatus) {
            this.resetPresentation();
        } else {
            this.props.Document.presStatus = true;
            this.startPresentation(0);
            this.gotoDocument(0, NumCast(this.props.Document.selectedDoc));
        }
    }

    //The function that resets the presentation by removing every action done by it. It also
    //stops the presentaton.
    @action
    resetPresentation = () => {
        this._childrenDocs.forEach((doc: Doc) => {
            doc.opacity = 1;
            doc.viewScale = 1;
        });
        this.props.Document.selectedDoc = 0;
        this.props.Document.presStatus = false;
        if (this._childrenDocs.length !== 0) {
            DocumentManager.Instance.zoomIntoScale(this._childrenDocs[0], 1);
        }
    }

    //The function that starts the presentation, also checking if actions should be applied
    //directly at start.
    startPresentation = (startIndex: number) => {
        this._presElementsMappings.forEach((component, doc) => {
            if (component.props.document.hideTillShownButton) {
                if (this._childrenDocs.indexOf(doc) > startIndex) {
                    doc.opacity = 0;
                }
            }
            if (component.props.document.hideAfterButton) {
                if (this._childrenDocs.indexOf(doc) < startIndex) {
                    doc.opacity = 0;
                }
            }
            if (component.props.document.fadeButton) {
                if (this._childrenDocs.indexOf(doc) < startIndex) {
                    doc.opacity = 0.5;
                }
            }
        });
    }

    addPressElem = (keyDoc: Doc, elem: PresentationElement) => {
        this._presElementsMappings.set(keyDoc, elem);
    }

    minimize = undoBatch(action(() => {
        this._presMode = true;
        this.props.addDocTab && this.props.addDocTab(this.props.Document, this.props.DataDoc, "close");
    }));

    specificContextMenu = (e: React.MouseEvent): void => {
        ContextMenu.Instance.addItem({ description: "Make Current Presentation", event: action(() => Doc.UserDoc().curPresentation = this.props.Document), icon: "asterisk" });
    }

    render() {
        return (
            <div className="presentationView-cont" onPointerEnter={action(() => !this._persistOpacity && (this._opacity = 1))} onContextMenu={this.specificContextMenu}
                onPointerLeave={action(() => !this._persistOpacity && (this._opacity = 0.4))}
                style={{ width: "100%", opacity: this._opacity, }}>
                <div className="presentation-buttons">
                    <button title="Back" className="presentation-button" onClick={this.back}><FontAwesomeIcon icon={"arrow-left"} /></button>
                    {this.renderPlayPauseButton()}
                    <button title="Next" className="presentation-button" onClick={this.next}><FontAwesomeIcon icon={"arrow-right"} /></button>
                    <button title="Minimize" className="presentation-button" onClick={this.minimize}><FontAwesomeIcon icon={"eye"} /></button>
                </div>
                <input
                    type="checkbox"
                    onChange={action((e: React.ChangeEvent<HTMLInputElement>) => {
                        this._persistOpacity = e.target.checked;
                        this._opacity = this._persistOpacity ? 1 : 0.4;
                    })}
                    checked={this._persistOpacity}
                    style={{ position: "absolute", bottom: 5, left: 5 }}
                    onPointerEnter={action(() => this._labelOpacity = 1)}
                    onPointerLeave={action(() => this._labelOpacity = 0)}
                />
                <p style={{ position: "absolute", bottom: 1, left: 22, opacity: this._labelOpacity, transition: "0.7s opacity ease" }}>opacity {this._persistOpacity ? "persistent" : "on focus"}</p>
                <PresentationViewList
                    mainDocument={this.props.Document}
                    deleteDocument={this.RemoveDoc}
                    gotoDocument={this.gotoDocument}
                    PresElementsMappings={this._presElementsMappings}
                    setChildrenDocs={this.setChildrenDocs}
                    presStatus={BoolCast(this.props.Document.presStatus)}
                    removeDocByRef={this.removeDocByRef}
                    clearElemMap={() => this._presElementsMappings.clear()}
                />
            </div>
        );
    }
}