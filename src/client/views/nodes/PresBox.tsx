import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faArrowLeft, faArrowRight, faEdit, faMinus, faPlay, faPlus, faStop, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, DocListCastAsync } from "../../../new_fields/Doc";
import { listSpec } from "../../../new_fields/Schema";
import { BoolCast, Cast, FieldValue, NumCast } from "../../../new_fields/Types";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { DocumentManager } from "../../util/DocumentManager";
import { undoBatch } from "../../util/UndoManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { ContextMenu } from "../ContextMenu";
import PresentationViewList from "../presentationview/PresentationList";
import "../presentationview/PresentationView.scss";
import { FieldView, FieldViewProps } from './FieldView';

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
    //variable that holds all the docs in the presentation
    @observable _childrenDocs: Doc[] = [];

    // whether presentation view has been minimized
    @observable _presMode = false;
    @observable public static CurrentPresentation: PresBox;

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
                if (!presDocs[nextSelected + 1].groupButton) {
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

            let presDocs = await DocListCastAsync(this.props.Document[this.props.fieldKey]);
            let currentsArray: Doc[] = [];
            for (; presDocs && prevSelected > 0 && presDocs[prevSelected].groupButton; prevSelected--) {
                currentsArray.push(presDocs[prevSelected]);
            }
            prevSelected = Math.max(0, prevSelected - 1);

            //checking if any of the group members had used zooming in
            currentsArray.forEach((doc: Doc) => {
                if (doc.showButton) {
                    zoomOut = true;
                    return;
                }
            });

            // if a group set that flag to zero or a single element
            //If so making sure to zoom out, which goes back to state before zooming action
            if (current > 0) {
                if (zoomOut || docAtCurrent.showButton) {
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
        this._childrenDocs.forEach((doc, ind) => {
            //the order of cases is aligned based on priority
            if (doc.hideTillShownButton) {
                if (ind <= index) {
                    doc.opacity = 1;
                }
            }
            if (doc.hideAfterButton) {
                if (ind < index) {
                    doc.opacity = 0;
                }
            }
            if (doc.fadeButton) {
                if (ind < index) {
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
        this._childrenDocs.forEach((key, ind) => {
            //the order of cases is aligned based on priority

            if (key.hideAfterButton) {
                if (ind >= index) {
                    key.opacity = 1;
                }
            }
            if (key.fadeButton) {
                if (ind >= index) {
                    key.opacity = 1;
                }
            }
            if (key.hideTillShownButton) {
                if (ind > index) {
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
            if (!presDocs[nextSelected + 1].groupButton) {
                break;
            }
            currentDocGroups.push(presDocs[nextSelected]);
        }

        currentDocGroups.forEach((doc: Doc, index: number) => {
            if (doc.navButton) {
                docToJump = doc;
                willZoom = false;
            }
            if (doc.showButton) {
                docToJump = doc;
                willZoom = true;
            }
        });

        //docToJump stayed same meaning, it was not in the group or was the last element in the group
        if (docToJump === curDoc) {
            //checking if curDoc has navigation open
            if (curDoc.navButton) {
                DocumentManager.Instance.jumpToDocument(curDoc, false);
            } else if (curDoc.showButton) {
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
     * The function that removes a doc from a presentation. 
     */
    @action
    public RemoveDoc = async (index: number) => {
        const value = FieldValue(Cast(this.props.Document.data, listSpec(Doc))); // don't replace with DocListCast -- we need to modify the document's actual stored list
        if (value) {
            value.splice(index, 1);
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
        this._childrenDocs.map(doc => {
            if (doc.hideTillShownButton) {
                if (this._childrenDocs.indexOf(doc) > startIndex) {
                    doc.opacity = 0;
                }
            }
            if (doc.hideAfterButton) {
                if (this._childrenDocs.indexOf(doc) < startIndex) {
                    doc.opacity = 0;
                }
            }
            if (doc.fadeButton) {
                if (this._childrenDocs.indexOf(doc) < startIndex) {
                    doc.opacity = 0.5;
                }
            }
        });
    }

    toggleMinimize = undoBatch(action((e: React.PointerEvent) => {
        if (this.props.Document.minimizedView) {
            this.props.Document.minimizedView = false;
            Doc.RemoveDocFromList((CurrentUserUtils.UserDocument.overlays as Doc), "data", this.props.Document);
            CollectionDockingView.AddRightSplit(this.props.Document, this.props.DataDoc);
        } else {
            this.props.Document.minimizedView = true;
            this.props.Document.x = e.clientX + 25;
            this.props.Document.y = e.clientY - 25;
            this.props.addDocTab && this.props.addDocTab(this.props.Document, this.props.DataDoc, "close");
            Doc.AddDocToList((CurrentUserUtils.UserDocument.overlays as Doc), "data", this.props.Document);
        }
    }));

    specificContextMenu = (e: React.MouseEvent): void => {
        ContextMenu.Instance.addItem({ description: "Make Current Presentation", event: action(() => Doc.UserDoc().curPresentation = this.props.Document), icon: "asterisk" });
    }

    render() {
        return (
            <div className="presentationView-cont" onContextMenu={this.specificContextMenu} style={{ width: "100%", minWidth: "200px", height: "100%", minHeight: "50px" }}>
                <div className="presentation-buttons" style={{ width: "100%" }}>
                    <button className="presentation-button" title="Back" onClick={this.back}><FontAwesomeIcon icon={"arrow-left"} /></button>
                    <button className="presentation-button" title={"Reset Presentation" + this.props.Document.presStatus ? "" : " From Start"} onClick={this.startOrResetPres}>
                        <FontAwesomeIcon icon={this.props.Document.presStatus ? "stop" : "play"} />
                    </button>
                    <button className="presentation-button" title="Next" onClick={this.next}><FontAwesomeIcon icon={"arrow-right"} /></button>
                    <button className="presentation-button" title={this.props.Document.minimizedView ? "Expand" : "Minimize"} onClick={this.toggleMinimize}><FontAwesomeIcon icon={"eye"} /></button>
                </div>
                {this.props.Document.minimizedView ? (null) :
                    <PresentationViewList
                        mainDocument={this.props.Document}
                        deleteDocument={this.RemoveDoc}
                        gotoDocument={this.gotoDocument}
                        setChildrenDocs={this.setChildrenDocs}
                        presStatus={BoolCast(this.props.Document.presStatus)}
                        removeDocByRef={this.removeDocByRef}
                    />}
            </div>
        );
    }
}