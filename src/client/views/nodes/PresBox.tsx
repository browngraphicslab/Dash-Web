import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, DocCastAsync } from "../../../new_fields/Doc";
import { InkTool } from "../../../new_fields/InkField";
import { BoolCast, Cast, NumCast, StrCast } from "../../../new_fields/Types";
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
import { List } from "../../../new_fields/List";
import { Docs } from "../../documents/Documents";
import { PrefetchProxy } from "../../../new_fields/Proxy";
import { ScriptField } from "../../../new_fields/ScriptField";
import { Scripting } from "../../util/Scripting";

type PresBoxSchema = makeInterface<[typeof documentSchema]>;
const PresBoxDocument = makeInterface(documentSchema);

@observer
export class PresBox extends ViewBoxBaseComponent<FieldViewProps, PresBoxSchema>(PresBoxDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(PresBox, fieldKey); }
    @observable _isChildActive = false;
    @computed get childDocs() { return DocListCast(this.dataDoc[this.fieldKey]); }
    @computed get itemIndex() { return NumCast(this.rootDoc._itemIndex); }
    @computed get presElement() { return Cast(Doc.UserDoc().presElement, Doc, null); }
    constructor(props: any) {
        super(props);
        if (!this.presElement) { // create exactly one presElmentBox template to use by any and all presentations.
            Doc.UserDoc().presElement = new PrefetchProxy(Docs.Create.PresElementBoxDocument({
                title: "pres element template", backgroundColor: "transparent", _xMargin: 5, _height: 46, isTemplateDoc: true, isTemplateForField: "data"
            }));
            // this script will be called by each presElement to get rendering-specific info that the PresBox knows about but which isn't written to the PresElement
            // this is a design choice -- we could write this data to the presElements which would require a reaction to keep it up to date, and it would prevent
            // the preselement docs from being part of multiple presentations since they would all have the same field, or we'd have to keep per-presentation data
            // stored on each pres element.  
            (this.presElement as Doc).lookupField = ScriptField.MakeFunction("lookupPresBoxField(container, field, data)",
                { field: "string", data: Doc.name, container: Doc.name });
        }
        this.props.Document.presentationFieldKey = this.fieldKey; // provide info to the presElement script so that it can look up rendering information about the presBox
    }

    componentDidMount() {
        this.rootDoc.presBox = this.rootDoc;
        this.rootDoc._forceRenderEngine = "timeline";
        this.rootDoc._replacedChrome = "replaced";
    }
    updateCurrentPresentation = () => Doc.UserDoc().activePresentation = this.rootDoc;

    @undoBatch
    @action
    next = () => {
        this.updateCurrentPresentation();
        if (this.childDocs[this.itemIndex + 1] !== undefined) {
            let nextSelected = this.itemIndex + 1;
            this.gotoDocument(nextSelected, this.itemIndex);

            for (nextSelected = nextSelected + 1; nextSelected < this.childDocs.length; nextSelected++) {
                if (!this.childDocs[nextSelected].groupButton) {
                    break;
                } else {
                    this.gotoDocument(nextSelected, this.itemIndex);
                }
            }
        }
    }

    @undoBatch
    @action
    back = () => {
        this.updateCurrentPresentation();
        const docAtCurrent = this.childDocs[this.itemIndex];
        if (docAtCurrent) {
            //check if any of the group members had used zooming in including the current document
            //If so making sure to zoom out, which goes back to state before zooming action
            let prevSelected = this.itemIndex;
            let didZoom = docAtCurrent.zoomButton;
            for (; !didZoom && prevSelected > 0 && this.childDocs[prevSelected].groupButton; prevSelected--) {
                didZoom = this.childDocs[prevSelected].zoomButton;
            }
            prevSelected = Math.max(0, prevSelected - 1);

            this.gotoDocument(prevSelected, this.itemIndex);
        }
    }

    /**
     * This is the method that checks for the actions that need to be performed
     * after the document has been presented, which involves 3 button options:
     * Hide Until Presented, Hide After Presented, Fade After Presented
     */
    showAfterPresented = (index: number) => {
        this.updateCurrentPresentation();
        this.childDocs.forEach((doc, ind) => {
            const presTargetDoc = doc.presentationTargetDoc as Doc;
            //the order of cases is aligned based on priority
            if (doc.presHideTillShownButton && ind <= index) {
                presTargetDoc.opacity = 1;
            }
            if (doc.presHideAfterButton && ind < index) {
                presTargetDoc.opacity = 0;
            }
            if (doc.presFadeButton && ind < index) {
                presTargetDoc.opacity = 0.5;
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
            const presTargetDoc = key.presentationTargetDoc as Doc;
            if (key.hideAfterButton && ind >= index) {
                presTargetDoc.opacity = 1;
            }
            if (key.fadeButton && ind >= index) {
                presTargetDoc.opacity = 1;
            }
            if (key.hideTillShownButton && ind > index) {
                presTargetDoc.opacity = 0;
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
            if (doc.presNavButton) {
                docToJump = doc;
                willZoom = false;
            }
            if (doc.presZoomButton) {
                docToJump = doc;
                willZoom = true;
            }
        });

        //docToJump stayed same meaning, it was not in the group or was the last element in the group
        const aliasOf = await DocCastAsync(docToJump.aliasOf);
        const srcContext = aliasOf && await DocCastAsync(aliasOf.context);
        if (docToJump === curDoc) {
            //checking if curDoc has navigation open
            const target = (await DocCastAsync(curDoc.presentationTargetDoc)) || curDoc;
            if (curDoc.presNavButton && target) {
                DocumentManager.Instance.jumpToDocument(target, false, undefined, srcContext);
            } else if (curDoc.presZoomButton && target) {
                //awaiting jump so that new scale can be found, since jumping is async
                await DocumentManager.Instance.jumpToDocument(target, true, undefined, srcContext);
            }
        } else {
            //awaiting jump so that new scale can be found, since jumping is async
            const presTargetDoc = await DocCastAsync(docToJump.presentationTargetDoc);
            presTargetDoc && await DocumentManager.Instance.jumpToDocument(presTargetDoc, willZoom, undefined, srcContext);
        }
    }

    //The function that is called when a document is clicked or reached through next or back.
    //it'll also execute the necessary actions if presentation is playing.
    public gotoDocument = (index: number, fromDoc: number) => {
        this.updateCurrentPresentation();
        Doc.UnBrushAllDocs();
        if (index >= 0 && index < this.childDocs.length) {
            this.rootDoc._itemIndex = index;

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
            this.gotoDocument(0, this.itemIndex);
        }
    }

    //The function that resets the presentation by removing every action done by it. It also
    //stops the presentaton.
    resetPresentation = () => {
        this.updateCurrentPresentation();
        this.childDocs.forEach(doc => (doc.presentationTargetDoc as Doc).opacity = 1);
        this.rootDoc._itemIndex = 0;
        this.layoutDoc.presStatus = false;
    }

    //The function that starts the presentation, also checking if actions should be applied
    //directly at start.
    startPresentation = (startIndex: number) => {
        this.updateCurrentPresentation();
        this.childDocs.map(doc => {
            const presTargetDoc = doc.presentationTargetDoc as Doc;
            if (doc.presHideTillShownButton && this.childDocs.indexOf(doc) > startIndex) {
                presTargetDoc.opacity = 0;
            }
            if (doc.presHideAfterButton && this.childDocs.indexOf(doc) < startIndex) {
                presTargetDoc.opacity = 0;
            }
            if (doc.presFadeButton && this.childDocs.indexOf(doc) < startIndex) {
                presTargetDoc.opacity = 0.5;
            }
        });
    }

    updateMinimize = action((e: React.ChangeEvent, mode: CollectionViewType) => {
        if (BoolCast(this.layoutDoc.inOverlay) !== (mode === CollectionViewType.Invalid)) {
            if (this.layoutDoc.inOverlay) {
                Doc.RemoveDocFromList((Doc.UserDoc().myOverlayDocuments as Doc), undefined, this.rootDoc);
                CollectionDockingView.AddRightSplit(this.rootDoc);
                this.layoutDoc.inOverlay = false;
            } else {
                const pt = this.props.ScreenToLocalTransform().inverse().transformPoint(0, 0);
                this.rootDoc.x = pt[0];// 500;//e.clientX + 25;
                this.rootDoc.y = pt[1];////e.clientY - 25;
                this.props.addDocTab?.(this.rootDoc, "close");
                Doc.AddDocToList((Doc.UserDoc().myOverlayDocuments as Doc), undefined, this.rootDoc);
            }
        }
    });

    @undoBatch
    viewChanged = action((e: React.ChangeEvent) => {
        //@ts-ignore
        const viewType = e.target.selectedOptions[0].value as CollectionViewType;
        viewType === CollectionViewType.Stacking && (this.rootDoc._pivotField = undefined); // pivot field may be set by the user in timeline view (or some other way) -- need to reset it here
        this.updateMinimize(e, this.rootDoc._viewType = viewType);
    });

    whenActiveChanged = action((isActive: boolean) => this.props.whenActiveChanged(this._isChildActive = isActive));
    addDocumentFilter = (doc: Doc | Doc[]) => {
        const docs = doc instanceof Doc ? [doc] : doc;
        docs.forEach(doc => {
            doc.aliasOf instanceof Doc && (doc.presentationTargetDoc = doc.aliasOf);
            !this.childDocs.includes(doc) && (doc.presZoomButton = true);
        });
        return true;
    }
    childLayoutTemplate = () => this.rootDoc._viewType !== CollectionViewType.Stacking ? undefined : this.presElement;
    removeDocument = (doc: Doc) => Doc.RemoveDocFromList(this.dataDoc, this.fieldKey, doc);
    selectElement = (doc: Doc) => this.gotoDocument(this.childDocs.indexOf(doc), NumCast(this.itemIndex));
    getTransform = () => this.props.ScreenToLocalTransform().translate(-5, -65);// listBox padding-left and pres-box-cont minHeight
    panelHeight = () => this.props.PanelHeight() - 20;
    active = (outsideReaction?: boolean) => ((InkingControl.Instance.selectedTool === InkTool.None && !this.layoutDoc.isBackground) &&
        (this.layoutDoc.forceActive || this.props.isSelected(outsideReaction) || this._isChildActive || this.props.renderDepth === 0) ? true : false)

    render() {
        this.rootDoc.presOrderedDocs = new List<Doc>(this.childDocs.map((child, i) => child));
        const mode = StrCast(this.rootDoc._viewType) as CollectionViewType;
        return <div className="presBox-cont" style={{ minWidth: this.layoutDoc.inOverlay ? 240 : undefined }} >
            <div className="presBox-buttons" style={{ display: this.rootDoc._chromeStatus === "disabled" ? "none" : undefined }}>
                <select className="presBox-viewPicker"
                    onPointerDown={e => e.stopPropagation()}
                    onChange={this.viewChanged}
                    value={mode}>
                    <option onPointerDown={e => e.stopPropagation()} value={CollectionViewType.Invalid}>Min</option>
                    <option onPointerDown={e => e.stopPropagation()} value={CollectionViewType.Stacking}>List</option>
                    <option onPointerDown={e => e.stopPropagation()} value={CollectionViewType.Time}>Time</option>
                    <option onPointerDown={e => e.stopPropagation()} value={CollectionViewType.Carousel}>Slides</option>
                </select>
                <div className="presBox-button" title="Back" style={{ gridColumn: 2 }} onClick={this.back}>
                    <FontAwesomeIcon icon={"arrow-left"} />
                </div>
                <div className="presBox-button" title={"Reset Presentation" + this.layoutDoc.presStatus ? "" : " From Start"} style={{ gridColumn: 3 }} onClick={this.startOrResetPres}>
                    <FontAwesomeIcon icon={this.layoutDoc.presStatus ? "stop" : "play"} />
                </div>
                <div className="presBox-button" title="Next" style={{ gridColumn: 4 }} onClick={this.next}>
                    <FontAwesomeIcon icon={"arrow-right"} />
                </div>
            </div>
            <div className="presBox-listCont" >
                {mode !== CollectionViewType.Invalid ?
                    <CollectionView {...this.props}
                        ContainingCollectionDoc={this.props.Document}
                        PanelWidth={this.props.PanelWidth}
                        PanelHeight={this.panelHeight}
                        moveDocument={returnFalse}
                        childLayoutTemplate={this.childLayoutTemplate}
                        filterAddDocument={this.addDocumentFilter}
                        removeDocument={returnFalse}
                        dontRegisterView={true}
                        focus={this.selectElement}
                        ScreenToLocalTransform={this.getTransform} />
                    : (null)
                }
            </div>
        </div>;
    }
}
Scripting.addGlobal(function lookupPresBoxField(container: Doc, field: string, data: Doc) {
    if (field === 'indexInPres') return DocListCast(container[StrCast(container.presentationFieldKey)]).indexOf(data);
    if (field === 'presCollapsedHeight') return container._viewType === CollectionViewType.Stacking ? 50 : 46;
    if (field === 'presStatus') return container.presStatus;
    if (field === '_itemIndex') return container._itemIndex;
    return undefined;
});
