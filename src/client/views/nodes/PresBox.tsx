import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faArrowLeft, faArrowRight, faEdit, faMinus, faPlay, faPlus, faStop, faHandPointLeft, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, DocCastAsync } from "../../../new_fields/Doc";
import { InkTool } from "../../../new_fields/InkField";
import { BoolCast, Cast, FieldValue, NumCast, StrCast } from "../../../new_fields/Types";
import { returnFalse } from "../../../Utils";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { DocumentManager } from "../../util/DocumentManager";
import { undoBatch } from "../../util/UndoManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionView, CollectionViewType } from "../collections/CollectionView";
import { InkingControl } from "../InkingControl";
import { FieldView, FieldViewProps } from './FieldView';
import "./PresBox.scss";
import { ViewBoxBaseComponent } from "../DocComponent";
import { makeInterface } from "../../../new_fields/Schema";

library.add(faArrowLeft);
library.add(faArrowRight);
library.add(faPlay);
library.add(faStop);
library.add(faHandPointLeft);
library.add(faPlus);
library.add(faTimes);
library.add(faMinus);
library.add(faEdit);

type PresBoxSchema = makeInterface<[typeof documentSchema]>;
const PresBoxDocument = makeInterface(documentSchema);

@observer
export class PresBox extends ViewBoxBaseComponent<FieldViewProps, PresBoxSchema>(PresBoxDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(PresBox, fieldKey); }
    _childReaction: IReactionDisposer | undefined;
    @observable _isChildActive = false;
    componentDidMount() {
        this.layoutDoc._forceRenderEngine = "timeline";
        this.layoutDoc._replacedChrome = "replaced";
        this._childReaction = reaction(() => this.childDocs.slice(), (children) => children.forEach((child, i) => child.presentationIndex = i), { fireImmediately: true });
    }
    componentWillUnmount() {
        this._childReaction?.();
    }

    @computed get childDocs() { return DocListCast(this.dataDoc[this.fieldKey]); }
    @computed get currentIndex() { return NumCast(this.layoutDoc._itemIndex); }

    updateCurrentPresentation = action(() => Doc.UserDoc().activePresentation = this.rootDoc);

    next = () => {
        this.updateCurrentPresentation();
        if (this.childDocs[this.currentIndex + 1] !== undefined) {
            let nextSelected = this.currentIndex + 1;
            this.gotoDocument(nextSelected, this.currentIndex);

            for (nextSelected = nextSelected + 1; nextSelected < this.childDocs.length; nextSelected++) {
                if (!this.childDocs[nextSelected].groupButton) {
                    break;
                } else {
                    this.gotoDocument(nextSelected, this.currentIndex);
                }
            }
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

            this.gotoDocument(prevSelected, this.currentIndex);
        }
    }

    whenActiveChanged = action((isActive: boolean) => this.props.whenActiveChanged(this._isChildActive = isActive));
    active = (outsideReaction?: boolean) => ((InkingControl.Instance.selectedTool === InkTool.None && !this.layoutDoc.isBackground) &&
        (this.layoutDoc.forceActive || this.props.isSelected(outsideReaction) || this._isChildActive || this.props.renderDepth === 0) ? true : false)

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
        let docToJump = curDoc;
        let willZoom = false;

        const presDocs = DocListCast(this.dataDoc[this.props.fieldKey]);
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
        const aliasOf = await DocCastAsync(docToJump.aliasOf);
        const srcContext = aliasOf && await DocCastAsync(aliasOf.context);
        if (docToJump === curDoc) {
            //checking if curDoc has navigation open
            const target = await DocCastAsync(curDoc.presentationTargetDoc);
            if (curDoc.navButton && target) {
                DocumentManager.Instance.jumpToDocument(target, false, undefined, srcContext);
            } else if (curDoc.zoomButton && target) {
                //awaiting jump so that new scale can be found, since jumping is async
                await DocumentManager.Instance.jumpToDocument(target, true, undefined, srcContext);
            }
        } else {
            //awaiting jump so that new scale can be found, since jumping is async
            const presTargetDoc = await DocCastAsync(docToJump.presentationTargetDoc);
            presTargetDoc && await DocumentManager.Instance.jumpToDocument(presTargetDoc, willZoom, undefined, srcContext);
        }
    }


    @undoBatch
    public removeDocument = (doc: Doc) => {
        return Doc.RemoveDocFromList(this.dataDoc, this.fieldKey, doc);
    }

    //The function that is called when a document is clicked or reached through next or back.
    //it'll also execute the necessary actions if presentation is playing.
    public gotoDocument = (index: number, fromDoc: number) => {
        this.updateCurrentPresentation();
        Doc.UnBrushAllDocs();
        if (index >= 0 && index < this.childDocs.length) {
            this.layoutDoc._itemIndex = index;

            if (!this.layoutDoc.presStatus) {
                this.layoutDoc.presStatus = true;
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
        if (this.layoutDoc.presStatus) {
            this.resetPresentation();
        } else {
            this.layoutDoc.presStatus = true;
            this.startPresentation(0);
            this.gotoDocument(0, this.currentIndex);
        }
    }

    addDocument = (doc: Doc) => {
        const newPinDoc = Doc.MakeAlias(doc);
        newPinDoc.presentationTargetDoc = doc;
        return Doc.AddDocToList(this.dataDoc, this.fieldKey, newPinDoc);
    }


    //The function that resets the presentation by removing every action done by it. It also
    //stops the presentaton.
    resetPresentation = () => {
        this.updateCurrentPresentation();
        this.childDocs.forEach(doc => (doc.presentationTargetDoc as Doc).opacity = 1);
        this.layoutDoc._itemIndex = 0;
        this.layoutDoc.presStatus = false;
    }

    //The function that starts the presentation, also checking if actions should be applied
    //directly at start.
    startPresentation = (startIndex: number) => {
        this.updateCurrentPresentation();
        this.childDocs.map(doc => {
            if (doc.hideTillShownButton && this.childDocs.indexOf(doc) > startIndex) {
                (doc.presentationTargetDoc as Doc).opacity = 0;
            }
            if (doc.hideAfterButton && this.childDocs.indexOf(doc) < startIndex) {
                (doc.presentationTargetDoc as Doc).opacity = 0;
            }
            if (doc.fadeButton && this.childDocs.indexOf(doc) < startIndex) {
                (doc.presentationTargetDoc as Doc).opacity = 0.5;
            }
        });
    }

    updateMinimize = undoBatch(action((e: React.ChangeEvent, mode: CollectionViewType) => {
        if (BoolCast(this.layoutDoc.inOverlay) !== (mode === CollectionViewType.Invalid)) {
            if (this.layoutDoc.inOverlay) {
                Doc.RemoveDocFromList((Doc.UserDoc().myOverlayDocuments as Doc), undefined, this.rootDoc);
                CollectionDockingView.AddRightSplit(this.rootDoc);
                this.layoutDoc.inOverlay = false;
            } else {
                this.layoutDoc.x = this.props.ScreenToLocalTransform().inverse().transformPoint(0, 0)[0];// 500;//e.clientX + 25;
                this.layoutDoc.y = this.props.ScreenToLocalTransform().inverse().transformPoint(0, 0)[1];////e.clientY - 25;
                this.props.addDocTab?.(this.rootDoc, "close");
                Doc.AddDocToList((Doc.UserDoc().myOverlayDocuments as Doc), undefined, this.rootDoc);
            }
        }
    }));

    initializeViewAliases = (docList: Doc[], viewtype: CollectionViewType) => {
        const hgt = (viewtype === CollectionViewType.Tree) ? 50 : 46;
        docList.forEach(doc => {
            doc.presBox = this.rootDoc; // give contained documents a reference to the presentation
            doc.collapsedHeight = hgt;  //  set the collpased height for documents based on the type of view (Tree or Stack) they will be displaye din
        });
    }

    selectElement = (doc: Doc) => {
        this.gotoDocument(this.childDocs.indexOf(doc), NumCast(this.layoutDoc._itemIndex));
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
        this.layoutDoc._viewType = e.target.selectedOptions[0].value;
        this.layoutDoc._viewType === CollectionViewType.Stacking && (this.layoutDoc._pivotField = undefined); // pivot field may be set by the user in timeline view (or some other way) -- need to reset it here
        this.updateMinimize(e, StrCast(this.layoutDoc._viewType));
    });

    childLayoutTemplate = () => this.layoutDoc._viewType === CollectionViewType.Stacking ? Cast(Doc.UserDoc()["template-presentation"], Doc, null) : undefined;
    render() {
        const mode = StrCast(this.layoutDoc._viewType) as CollectionViewType;
        this.initializeViewAliases(this.childDocs, mode);
        return <div className="presBox-cont" style={{ minWidth: this.layoutDoc.inOverlay ? 240 : undefined, pointerEvents: this.active() || this.layoutDoc.inOverlay ? "all" : "none" }} >
            <div className="presBox-buttons" style={{ display: this.layoutDoc._chromeStatus === "disabled" ? "none" : undefined }}>
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
                <button className="presBox-button" title={"Reset Presentation" + this.layoutDoc.presStatus ? "" : " From Start"} onClick={this.startOrResetPres}>
                    <FontAwesomeIcon icon={this.layoutDoc.presStatus ? "stop" : "play"} />
                </button>
                <button className="presBox-button" title="Next" onClick={this.next}><FontAwesomeIcon icon={"arrow-right"} /></button>
            </div>
            <div className="presBox-listCont" >
                {mode !== CollectionViewType.Invalid ?
                    <CollectionView {...this.props}
                        PanelHeight={this.panelHeight}
                        moveDocument={returnFalse}
                        childLayoutTemplate={this.childLayoutTemplate}
                        addDocument={this.addDocument}
                        removeDocument={returnFalse}
                        focus={this.selectElement}
                        ScreenToLocalTransform={this.getTransform} />
                    : (null)
                }
            </div>
        </div>;
    }
}