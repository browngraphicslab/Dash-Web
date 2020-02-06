import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faArrowLeft, faArrowRight, faEdit, faMinus, faPlay, faPlus, faStop, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, reaction, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, DocListCastAsync } from "../../../new_fields/Doc";
import { listSpec } from "../../../new_fields/Schema";
import { Cast, FieldValue, NumCast } from "../../../new_fields/Types";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { Docs } from "../../documents/Documents";
import { DocumentManager } from "../../util/DocumentManager";
import { undoBatch } from "../../util/UndoManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionView, CollectionViewType } from "../collections/CollectionView";
import { ContextMenu } from "../ContextMenu";
import { FieldView, FieldViewProps } from './FieldView';
import "./PresBox.scss";
import { CollectionCarouselView } from "../collections/CollectionCarouselView";
import { returnFalse } from "../../../Utils";
import { ContextMenuProps } from "../ContextMenuItem";
import { CollectionTimeView } from "../collections/CollectionTimeView";

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
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(PresBox, fieldKey); }
    _childReaction: IReactionDisposer | undefined;
    _slideshowReaction: IReactionDisposer | undefined;
    componentDidMount() {
        const userDoc = CurrentUserUtils.UserDocument;
        this._slideshowReaction = reaction(() => this.props.Document._slideshow,
            (slideshow) => {
                if (!slideshow) {
                    let presTemp = Cast(userDoc.presentationTemplate, Doc);
                    if (presTemp instanceof Promise) {
                        presTemp.then(presTemp => this.props.Document.childLayout = presTemp);
                    }
                    else if (presTemp === undefined) {
                        presTemp = userDoc.presentationTemplate = Docs.Create.PresElementBoxDocument({ backgroundColor: "transparent", _xMargin: 5, isTemplateDoc: true, isTemplateForField: "data" });
                    }
                    else {
                        this.props.Document.childLayout = presTemp;
                    }
                } else {
                    this.props.Document.childLayout = undefined;
                }
            }, { fireImmediately: true });
        this._childReaction = reaction(() => this.childDocs.slice(),
            (children) => children.forEach((child, i) => child.presentationIndex = i), { fireImmediately: true });
    }
    componentWillUnmount() {
        this._childReaction?.();
    }

    @computed get childDocs() { return DocListCast(this.props.Document[this.props.fieldKey]); }

    next = async () => {
        const current = NumCast(this.props.Document._itemIndex);
        //asking to get document at current index
        const docAtCurrentNext = await this.getDocAtIndex(current + 1);
        if (docAtCurrentNext !== undefined) {
            const presDocs = DocListCast(this.props.Document[this.props.fieldKey]);
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
        const current = NumCast(this.props.Document._itemIndex);
        //requesting for the doc at current index
        const docAtCurrent = await this.getDocAtIndex(current);
        if (docAtCurrent !== undefined) {

            //asking for its presentation id.
            let prevSelected = current;
            let zoomOut: boolean = false;

            const presDocs = await DocListCastAsync(this.props.Document[this.props.fieldKey]);
            const currentsArray: Doc[] = [];
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
                    const prevScale = NumCast(this.childDocs[prevSelected].viewScale, null);
                    const curScale = DocumentManager.Instance.getScaleOfDocView(this.childDocs[current]);
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
        this.childDocs.forEach((doc, ind) => {
            //the order of cases is aligned based on priority
            if (doc.hideTillShownButton && ind <= index) {
                (doc.presentationTargetDoc as Doc).opacity = 1;
            }
            if (doc.hideAfterButton && ind < index) {
                (doc.presentationTargetDoc as Doc).opacity = 0;
            }
            if (doc.fadeButton && ind < index) {
                (doc.presentationTargetDoc as Doc).opacity = 0.5;
            }
        });
    }

    /**
     * This is the method that checks for the actions that need to be performed
     * before the document has been presented, which involves 3 button options:
     * Hide Until Presented, Hide After Presented, Fade After Presented
     */
    hideIfNotPresented = (index: number) => {
        this.childDocs.forEach((key, ind) => {
            //the order of cases is aligned based on priority

            if (key.hideAfterButton && ind >= index) {
                (key.presentationTargetDoc as Doc).opacity = 1;
            }
            if (key.fadeButton && ind >= index) {
                (key.presentationTargetDoc as Doc).opacity = 1;
            }
            if (key.hideTillShownButton && ind > index) {
                (key.presentationTargetDoc as Doc).opacity = 0;
            }
        });
    }

    /**
     * This method makes sure that cursor navigates to the element that
     * has the option open and last in the group. If not in the group, and it has
     * te option open, navigates to that element.
     */
    navigateToElement = async (curDoc: Doc, fromDocIndex: number) => {
        const fromDoc = this.childDocs[fromDocIndex].presentationTargetDoc as Doc;
        let docToJump = curDoc;
        let willZoom = false;

        const presDocs = DocListCast(this.props.Document[this.props.fieldKey]);
        let nextSelected = presDocs.indexOf(curDoc);
        const currentDocGroups: Doc[] = [];
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
        const aliasOf = await Cast(docToJump.aliasOf, Doc);
        const srcContext = aliasOf && await Cast(aliasOf.sourceContext, Doc);
        if (docToJump === curDoc) {
            //checking if curDoc has navigation open
            const target = await Cast(curDoc.presentationTargetDoc, Doc);
            if (curDoc.navButton && target) {
                DocumentManager.Instance.jumpToDocument(target, false, undefined, srcContext);
            } else if (curDoc.showButton && target) {
                const curScale = DocumentManager.Instance.getScaleOfDocView(fromDoc);
                //awaiting jump so that new scale can be found, since jumping is async
                await DocumentManager.Instance.jumpToDocument(target, true, undefined, srcContext);
                curDoc.viewScale = DocumentManager.Instance.getScaleOfDocView(target);

                //saving the scale user was on before zooming in
                if (curScale !== 1) {
                    fromDoc.viewScale = curScale;
                }

            }
            return;
        }
        const curScale = DocumentManager.Instance.getScaleOfDocView(fromDoc);

        //awaiting jump so that new scale can be found, since jumping is async
        const presTargetDoc = await docToJump.presentationTargetDoc as Doc;
        await DocumentManager.Instance.jumpToDocument(presTargetDoc, willZoom, undefined, srcContext);
        const newScale = DocumentManager.Instance.getScaleOfDocView(await curDoc.presentationTargetDoc as Doc);
        curDoc.viewScale = newScale;
        //saving the scale that user was on
        if (curScale !== 1) {
            fromDoc.viewScale = curScale;
        }

    }

    /**
     * Async function that supposedly return the doc that is located at given index.
     */
    getDocAtIndex = async (index: number) => {
        const list = FieldValue(Cast(this.props.Document[this.props.fieldKey], listSpec(Doc)));
        if (list && index >= 0 && index < list.length) {
            this.props.Document._itemIndex = index;
            //awaiting async call to finish to get Doc instance
            return list[index];
        }
        return undefined;
    }


    @undoBatch
    public removeDocument = (doc: Doc) => {
        const value = FieldValue(Cast(this.props.Document[this.props.fieldKey], listSpec(Doc)));
        if (value) {
            const indexOfDoc = value.indexOf(doc);
            if (indexOfDoc !== - 1) {
                value.splice(indexOfDoc, 1)[0];
                return true;
            }
        }
        return false;
    }

    //The function that is called when a document is clicked or reached through next or back.
    //it'll also execute the necessary actions if presentation is playing.
    @action
    public gotoDocument = async (index: number, fromDoc: number) => {
        Doc.UnBrushAllDocs();
        const list = FieldValue(Cast(this.props.Document[this.props.fieldKey], listSpec(Doc)));
        if (list && index >= 0 && index < list.length) {
            this.props.Document._itemIndex = index;

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

    //The function that starts or resets presentaton functionally, depending on status flag.
    @action
    startOrResetPres = () => {
        if (this.props.Document.presStatus) {
            this.resetPresentation();
        } else {
            this.props.Document.presStatus = true;
            this.startPresentation(0);
            this.gotoDocument(0, NumCast(this.props.Document._itemIndex));
        }
    }

    addDocument = (doc: Doc) => {
        const newPinDoc = Doc.MakeAlias(doc);
        newPinDoc.presentationTargetDoc = doc;
        return Doc.AddDocToList(this.props.Document, this.props.fieldKey, newPinDoc);
    }


    //The function that resets the presentation by removing every action done by it. It also
    //stops the presentaton.
    @action
    resetPresentation = () => {
        this.childDocs.forEach((doc: Doc) => {
            doc.opacity = 1;
            doc.viewScale = 1;
        });
        this.props.Document._itemIndex = 0;
        this.props.Document.presStatus = false;
        if (this.childDocs.length !== 0) {
            DocumentManager.Instance.zoomIntoScale(this.childDocs[0], 1);
        }
    }

    //The function that starts the presentation, also checking if actions should be applied
    //directly at start.
    startPresentation = (startIndex: number) => {
        this.childDocs.map(doc => {
            if (doc.hideTillShownButton && this.childDocs.indexOf(doc) > startIndex) {
                doc.opacity = 0;
            }
            if (doc.hideAfterButton && this.childDocs.indexOf(doc) < startIndex) {
                doc.opacity = 0;
            }
            if (doc.fadeButton && this.childDocs.indexOf(doc) < startIndex) {
                doc.opacity = 0.5;
            }
        });
    }

    toggleMinimize = undoBatch(action((e: React.PointerEvent) => {
        if (this.props.Document.inOverlay) {
            Doc.RemoveDocFromList((CurrentUserUtils.UserDocument.overlays as Doc), this.props.fieldKey, this.props.Document);
            CollectionDockingView.AddRightSplit(this.props.Document, this.props.DataDoc);
            this.props.Document.inOverlay = false;
        } else {
            this.props.Document.x = e.clientX + 25;
            this.props.Document.y = e.clientY - 25;
            this.props.addDocTab && this.props.addDocTab(this.props.Document, this.props.DataDoc, "close");
            Doc.AddDocToList((CurrentUserUtils.UserDocument.overlays as Doc), this.props.fieldKey, this.props.Document);
        }
    }));

    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: "Make Current Presentation", event: action(() => Doc.UserDoc().curPresentation = this.props.Document), icon: "asterisk" });
        funcs.push({ description: "Make slideshow", event: action(() => this.props.Document._slideshow = "slideshow"), icon: "asterisk" });
        funcs.push({ description: "Make timeline", event: action(() => this.props.Document._slideshow = "timeline"), icon: "asterisk" });
        funcs.push({ description: "Make list", event: action(() => this.props.Document._slideshow = "list"), icon: "asterisk" });
        ContextMenu.Instance.addItem({ description: "Presentatoin Funcs...", subitems: funcs, icon: "asterisk" });
    }

    /**
     * Initially every document starts with a viewScale 1, which means
     * that they will be displayed in a canvas with scale 1.
     */
    @action
    initializeScaleViews = (docList: Doc[], viewtype: number) => {
        this.props.Document._chromeStatus = "disabled";
        const hgt = (viewtype === CollectionViewType.Tree) ? 50 : 46;
        docList.forEach((doc: Doc) => {
            doc.presBox = this.props.Document;
            doc.presBoxKey = this.props.fieldKey;
            doc.collapsedHeight = hgt;
            doc._nativeWidth = doc._nativeHeight = undefined;
            const curScale = NumCast(doc.viewScale, null);
            if (curScale === undefined) {
                doc.viewScale = 1;
            }
        });
    }

    selectElement = (doc: Doc) => {
        const index = DocListCast(this.props.Document[this.props.fieldKey]).indexOf(doc);
        index !== -1 && this.gotoDocument(index, NumCast(this.props.Document._itemIndex));
    }

    getTransform = () => {
        return this.props.ScreenToLocalTransform().translate(0, -50);// listBox padding-left and pres-box-cont minHeight
    }
    panelHeight = () => {
        return this.props.PanelHeight() - 20;
    }
    render() {
        this.initializeScaleViews(this.childDocs, NumCast(this.props.Document._viewType));
        return (this.props.Document._slideshow ?
            <div className="presBox-cont" onContextMenu={this.specificContextMenu}>
                {this.props.Document.inOverlay ? (null) :
                    <div className="presBox-listCont" >
                        {this.props.Document._slideshow === "slideshow" ?
                            <CollectionCarouselView {...this.props} PanelHeight={this.panelHeight} chromeCollapsed={true} annotationsKey={""} CollectionView={undefined}
                                moveDocument={returnFalse}
                                addDocument={this.addDocument} removeDocument={returnFalse} focus={this.selectElement} ScreenToLocalTransform={this.getTransform} />
                            :
                            <CollectionTimeView {...this.props} PanelHeight={this.panelHeight} chromeCollapsed={true} annotationsKey={""} CollectionView={undefined}
                                moveDocument={returnFalse}
                                addDocument={this.addDocument} removeDocument={returnFalse} focus={this.selectElement} ScreenToLocalTransform={this.getTransform} />
                        }
                    </div>}
                <button className="presBox-backward" title="Back" onClick={this.back}><FontAwesomeIcon icon={"arrow-left"} /></button>
                <button className="presBox-forward" title="Next" onClick={this.next}><FontAwesomeIcon icon={"arrow-right"} /></button>
            </div>
            : <div className="presBox-cont" onContextMenu={this.specificContextMenu}>
                <div className="presBox-buttons">
                    <button className="presBox-button" title="Back" onClick={this.back}><FontAwesomeIcon icon={"arrow-left"} /></button>
                    <button className="presBox-button" title={"Reset Presentation" + this.props.Document.presStatus ? "" : " From Start"} onClick={this.startOrResetPres}>
                        <FontAwesomeIcon icon={this.props.Document.presStatus ? "stop" : "play"} />
                    </button>
                    <button className="presBox-button" title="Next" onClick={this.next}><FontAwesomeIcon icon={"arrow-right"} /></button>
                    <button className="presBox-button" title={this.props.Document.inOverlay ? "Expand" : "Minimize"} onClick={this.toggleMinimize}><FontAwesomeIcon icon={"eye"} /></button>
                    {this.props.Document.inOverlay ? (null) :
                        <div className="presBox-listCont" >
                            <CollectionView {...this.props} PanelHeight={this.panelHeight} addDocument={this.addDocument} focus={this.selectElement} ScreenToLocalTransform={this.getTransform} />
                        </div>}
                </div></div>);
    }
}