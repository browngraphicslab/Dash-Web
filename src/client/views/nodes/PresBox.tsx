import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faArrowLeft, faArrowRight, faEdit, faMinus, faPlay, faPlus, faStop, faHandPointLeft, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { InkTool } from "../../../new_fields/InkField";
import { BoolCast, Cast, FieldValue, NumCast } from "../../../new_fields/Types";
import { returnFalse } from "../../../Utils";
import { DocumentManager } from "../../util/DocumentManager";
import { undoBatch } from "../../util/UndoManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionView, CollectionViewType } from "../collections/CollectionView";
import { InkingControl } from "../InkingControl";
import { FieldView, FieldViewProps } from './FieldView';
import "./PresBox.scss";

library.add(faArrowLeft);
library.add(faArrowRight);
library.add(faPlay);
library.add(faStop);
library.add(faHandPointLeft);
library.add(faPlus);
library.add(faTimes);
library.add(faMinus);
library.add(faEdit);

@observer
export class PresBox extends React.Component<FieldViewProps> {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(PresBox, fieldKey); }
    _childReaction: IReactionDisposer | undefined;
    @observable _isChildActive = false;
    componentDidMount() {
        this.props.Document._forceRenderEngine = "timeline";
        this.props.Document._replacedChrome = "replaced";
        this._childReaction = reaction(() => this.childDocs.slice(), (children) => children.forEach((child, i) => child.presentationIndex = i), { fireImmediately: true });
    }
    componentWillUnmount() {
        this._childReaction?.();
    }

    @computed get childDocs() { return DocListCast(this.props.Document[this.props.fieldKey]); }
    @computed get currentIndex() { return NumCast(this.props.Document._itemIndex); }

    updateCurrentPresentation = action(() => Doc.UserDoc().curPresentation = this.props.Document);

    next = () => {
        this.updateCurrentPresentation();
        if (this.childDocs[this.currentIndex + 1] !== undefined) {
            let nextSelected = this.currentIndex + 1;

            for (; nextSelected < this.childDocs.length - 1; nextSelected++) {
                if (!this.childDocs[nextSelected + 1].groupButton) {
                    break;
                }
            }

            this.gotoDocument(nextSelected, this.currentIndex);
        }
    }
    back = () => {
        this.updateCurrentPresentation();
        const docAtCurrent = this.childDocs[this.currentIndex];
        if (docAtCurrent) {
            //check if any of the group members had used zooming in including the current document
            //If so making sure to zoom out, which goes back to state before zooming action
            let prevSelected = this.currentIndex;
            let didZoom = docAtCurrent.zoomButton;
            for (; !didZoom && prevSelected > 0 && this.childDocs[prevSelected].groupButton; prevSelected--) {
                didZoom = this.childDocs[prevSelected].zoomButton;
            }
            prevSelected = Math.max(0, prevSelected - 1);

            if (this.currentIndex > 0 && didZoom) {
                const prevScale = NumCast(this.childDocs[prevSelected].viewScale);
                const curScale = DocumentManager.Instance.getScaleOfDocView(docAtCurrent);
                if (prevScale && prevScale !== curScale) {
                    DocumentManager.Instance.zoomIntoScale(docAtCurrent, prevScale);
                }
            }
            this.gotoDocument(prevSelected, this.currentIndex);
        }
    }

    whenActiveChanged = action((isActive: boolean) => this.props.whenActiveChanged(this._isChildActive = isActive));
    active = (outsideReaction?: boolean) => ((InkingControl.Instance.selectedTool === InkTool.None && !this.props.Document.isBackground) &&
        (this.props.Document.forceActive || this.props.isSelected(outsideReaction) || this._isChildActive || this.props.renderDepth === 0) ? true : false)

    /**
     * This is the method that checks for the actions that need to be performed
     * after the document has been presented, which involves 3 button options:
     * Hide Until Presented, Hide After Presented, Fade After Presented
     */
    showAfterPresented = (index: number) => {
        this.updateCurrentPresentation();
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
        this.updateCurrentPresentation();
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
        this.updateCurrentPresentation();
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
            if (doc.zoomButton) {
                docToJump = doc;
                willZoom = true;
            }
        });

        //docToJump stayed same meaning, it was not in the group or was the last element in the group
        const aliasOf = await Cast(docToJump.aliasOf, Doc);
        const srcContext = aliasOf && await Cast(aliasOf.anchor1_context, Doc);
        if (docToJump === curDoc) {
            //checking if curDoc has navigation open
            const target = await Cast(curDoc.presentationTargetDoc, Doc);
            if (curDoc.navButton && target) {
                DocumentManager.Instance.jumpToDocument(target, false, undefined, srcContext);
            } else if (curDoc.zoomButton && target) {
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


    @undoBatch
    public removeDocument = (doc: Doc) => {
        return Doc.RemoveDocFromList(this.props.Document, this.props.fieldKey, doc);
    }

    //The function that is called when a document is clicked or reached through next or back.
    //it'll also execute the necessary actions if presentation is playing.
    public gotoDocument = (index: number, fromDoc: number) => {
        this.updateCurrentPresentation();
        Doc.UnBrushAllDocs();
        if (index >= 0 && index < this.childDocs.length) {
            this.props.Document._itemIndex = index;

            if (!this.props.Document.presStatus) {
                this.props.Document.presStatus = true;
                this.startPresentation(index);
            }

            this.navigateToElement(this.childDocs[index], fromDoc);
            this.hideIfNotPresented(index);
            this.showAfterPresented(index);
        }
    }

    //The function that starts or resets presentaton functionally, depending on status flag.
    startOrResetPres = () => {
        this.updateCurrentPresentation();
        if (this.props.Document.presStatus) {
            this.resetPresentation();
        } else {
            this.props.Document.presStatus = true;
            this.startPresentation(0);
            this.gotoDocument(0, this.currentIndex);
        }
    }

    addDocument = (doc: Doc) => {
        const newPinDoc = Doc.MakeAlias(doc);
        newPinDoc.presentationTargetDoc = doc;
        return Doc.AddDocToList(this.props.Document, this.props.fieldKey, newPinDoc);
    }


    //The function that resets the presentation by removing every action done by it. It also
    //stops the presentaton.
    resetPresentation = () => {
        this.updateCurrentPresentation();
        this.childDocs.forEach(doc => doc.opacity = doc.viewScale = 1);
        this.props.Document._itemIndex = 0;
        this.props.Document.presStatus = false;
        this.childDocs.length && DocumentManager.Instance.zoomIntoScale(this.childDocs[0], 1);
    }

    //The function that starts the presentation, also checking if actions should be applied
    //directly at start.
    startPresentation = (startIndex: number) => {
        this.updateCurrentPresentation();
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

    updateMinimize = undoBatch(action((e: React.ChangeEvent, mode: number) => {
        if (BoolCast(this.props.Document.inOverlay) !== (mode === CollectionViewType.Invalid)) {
            if (this.props.Document.inOverlay) {
                Doc.RemoveDocFromList((Doc.UserDoc().overlays as Doc), undefined, this.props.Document);
                CollectionDockingView.AddRightSplit(this.props.Document);
                this.props.Document.inOverlay = false;
            } else {
                this.props.Document.x = this.props.ScreenToLocalTransform().inverse().transformPoint(0, 0)[0];// 500;//e.clientX + 25;
                this.props.Document.y = this.props.ScreenToLocalTransform().inverse().transformPoint(0, 0)[1];////e.clientY - 25;
                this.props.addDocTab?.(this.props.Document, "close");
                Doc.AddDocToList((Doc.UserDoc().overlays as Doc), undefined, this.props.Document);
            }
        }
    }));

    /**
     * Initially every document starts with a viewScale 1, which means
     * that they will be displayed in a canvas with scale 1.
     */
    initializeScaleViews = (docList: Doc[], viewtype: number) => {
        const hgt = (viewtype === CollectionViewType.Tree) ? 50 : 46;
        docList.forEach(doc => {
            doc.presBox = this.props.Document; // give contained documents a reference to the presentation
            doc.collapsedHeight = hgt;  //  set the collpased height for documents based on the type of view (Tree or Stack) they will be displaye din
            !NumCast(doc.viewScale) && (doc.viewScale = 1);
        });
    }

    selectElement = (doc: Doc) => {
        this.gotoDocument(this.childDocs.indexOf(doc), NumCast(this.props.Document._itemIndex));
    }

    getTransform = () => {
        return this.props.ScreenToLocalTransform().translate(-5, -65);// listBox padding-left and pres-box-cont minHeight
    }
    panelHeight = () => {
        return this.props.PanelHeight() - 20;
    }

    @undoBatch
    viewChanged = action((e: React.ChangeEvent) => {
        //@ts-ignore
        this.props.Document._viewType = Number(e.target.selectedOptions[0].value);
        this.props.Document._viewType === CollectionViewType.Stacking && (this.props.Document._pivotField = undefined); // pivot field may be set by the user in timeline view (or some other way) -- need to reset it here
        this.updateMinimize(e, Number(this.props.Document._viewType));
    });

    childLayoutTemplate = () => this.props.Document._viewType === CollectionViewType.Stacking ? Cast(Doc.UserDoc().presentationTemplate, Doc, null) : undefined;
    render() {
        const mode = NumCast(this.props.Document._viewType, CollectionViewType.Invalid);
        this.initializeScaleViews(this.childDocs, mode);
        return <div className="presBox-cont" style={{ minWidth: this.props.Document.inOverlay ? 240 : undefined, pointerEvents: this.active() || this.props.Document.inOverlay ? "all" : "none" }} >
            <div className="presBox-buttons" style={{ display: this.props.Document._chromeStatus === "disabled" ? "none" : undefined }}>
                <select className="collectionViewBaseChrome-viewPicker"
                    onPointerDown={e => e.stopPropagation()}
                    onChange={this.viewChanged}
                    value={mode}>
                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={e => e.stopPropagation()} value={CollectionViewType.Invalid}>Min</option>
                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={e => e.stopPropagation()} value={CollectionViewType.Stacking}>List</option>
                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={e => e.stopPropagation()} value={CollectionViewType.Time}>Time</option>
                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={e => e.stopPropagation()} value={CollectionViewType.Carousel}>Slides</option>
                </select>
                <button className="presBox-button" title="Back" onClick={this.back}><FontAwesomeIcon icon={"arrow-left"} /></button>
                <button className="presBox-button" title={"Reset Presentation" + this.props.Document.presStatus ? "" : " From Start"} onClick={this.startOrResetPres}>
                    <FontAwesomeIcon icon={this.props.Document.presStatus ? "stop" : "play"} />
                </button>
                <button className="presBox-button" title="Next" onClick={this.next}><FontAwesomeIcon icon={"arrow-right"} /></button>
            </div>
            <div className="presBox-listCont" >
                {mode !== CollectionViewType.Invalid ?
                    <CollectionView {...this.props} PanelHeight={this.panelHeight} moveDocument={returnFalse} childLayoutTemplate={this.childLayoutTemplate}
                        addDocument={this.addDocument} removeDocument={returnFalse} focus={this.selectElement} ScreenToLocalTransform={this.getTransform} />
                    : (null)
                }
            </div>
        </div>;
    }
}