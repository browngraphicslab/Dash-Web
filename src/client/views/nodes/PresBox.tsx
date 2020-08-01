import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, DocCastAsync, WidthSym } from "../../../fields/Doc";
import { InkTool } from "../../../fields/InkField";
import { BoolCast, Cast, NumCast, StrCast, ScriptCast } from "../../../fields/Types";
import { returnFalse, returnOne, numberRange, setupMoveUpEvents, emptyFunction, returnTrue } from "../../../Utils";
import { documentSchema } from "../../../fields/documentSchemas";
import { DocumentManager } from "../../util/DocumentManager";
import { undoBatch } from "../../util/UndoManager";
import { CollectionDockingView, DockedFrameRenderer } from "../collections/CollectionDockingView";
import { CollectionView, CollectionViewType } from "../collections/CollectionView";
import { FieldView, FieldViewProps } from './FieldView';
import "./PresBox.scss";
import { ViewBoxBaseComponent } from "../DocComponent";
import { makeInterface, listSpec } from "../../../fields/Schema";
import { Docs, DocUtils } from "../../documents/Documents";
import { PrefetchProxy } from "../../../fields/Proxy";
import { ScriptField } from "../../../fields/ScriptField";
import { Scripting } from "../../util/Scripting";
import { InkingStroke } from "../InkingStroke";
import { HighlightSpanKind } from "typescript";
import { SearchUtil } from "../../util/SearchUtil";
import { CollectionFreeFormDocumentView } from "./CollectionFreeFormDocumentView";
import { child } from "serializr";
import { List } from "../../../fields/List";
import { Tooltip } from "@material-ui/core";
import { CollectionFreeFormViewChrome } from "../collections/CollectionMenu";
import { conformsTo } from "lodash";
import { translate } from "googleapis/build/src/apis/translate";
import { DragManager, dropActionType } from "../../util/DragManager";

type PresBoxSchema = makeInterface<[typeof documentSchema]>;
const PresBoxDocument = makeInterface(documentSchema);

@observer
export class PresBox extends ViewBoxBaseComponent<FieldViewProps, PresBoxSchema>(PresBoxDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(PresBox, fieldKey); }
    private treedropDisposer?: DragManager.DragDropDisposer;
    static Instance: PresBox;
    @observable _isChildActive = false;
    @computed get childDocs() { return DocListCast(this.dataDoc[this.fieldKey]); }
    @computed get itemIndex() { return NumCast(this.rootDoc._itemIndex); }
    @computed get presElement() { return Cast(Doc.UserDoc().presElement, Doc, null); }
    constructor(props: any) {
        super(props);
        PresBox.Instance = this;
        if (!this.presElement) { // create exactly one presElmentBox template to use by any and all presentations.
            Doc.UserDoc().presElement = new PrefetchProxy(Docs.Create.PresElementBoxDocument({
                title: "pres element template", backgroundColor: "transparent", _xMargin: 0, isTemplateDoc: true, isTemplateForField: "data"
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
        this.layoutDoc.presStatus = "edit";
        this.layoutDoc._gridGap = 5;
        // document.addEventListener("keydown", this.keyEvents, false);
    }

    componentWillUnmount() {
        this.treedropDisposer?.();
    }

    onPointerOver = () => {
        document.addEventListener("keydown", this.keyEvents, true);
    }

    onPointerLeave = () => {
        document.removeEventListener("keydown", this.keyEvents, true);
    }

    updateCurrentPresentation = () => {
        Doc.UserDoc().activePresentation = this.rootDoc;
    }

    @undoBatch
    @action
    next = () => {
        this.updateCurrentPresentation();
        const presTargetDoc = Cast(this.childDocs[this.itemIndex].presentationTargetDoc, Doc, null);
        const lastFrame = Cast(presTargetDoc.lastFrame, "number", null);
        const curFrame = NumCast(presTargetDoc.currentFrame);
        // Case 1: There are still other frames and should go through all frames before going to next slide
        if (lastFrame !== undefined && curFrame < lastFrame) {
            presTargetDoc._viewTransition = "all 1s";
            setTimeout(() => presTargetDoc._viewTransition = undefined, 1010);
            presTargetDoc.currentFrame = curFrame + 1;
            if (presTargetDoc.zoomProgressivize) {
                const srcContext = Cast(presTargetDoc.context, Doc, null);
                const srcDocView = DocumentManager.Instance.getDocumentView(srcContext);
                if (srcContext && srcDocView) {
                    const layoutdoc = Doc.Layout(presTargetDoc);
                    const panelWidth: number = srcDocView.props.PanelWidth();
                    const panelHeight: number = srcDocView.props.PanelHeight();
                    console.log("srcDocView: " + srcDocView.props.PanelWidth());
                    // console.log("layoutdoc._width: " + layoutdoc._width);
                    // console.log("srcContext._width: " + srcContext._width);
                    const newPanX = NumCast(presTargetDoc.x) + NumCast(layoutdoc._width) / 2;
                    const newPanY = NumCast(presTargetDoc.y) + NumCast(layoutdoc._height) / 2;
                    // const newPanX = NumCast(presTargetDoc.x) + panelWidth / 2;
                    // const newPanY = NumCast(presTargetDoc.y) + panelHeight / 2;
                    let newScale = 0.9 * Math.min(Number(panelWidth) / this.checkList(presTargetDoc, presTargetDoc["viewfinder-width-indexed"]), Number(panelHeight) / this.checkList(presTargetDoc, presTargetDoc["viewfinder-height-indexed"]));
                    // srcContext._panX = newPanX + (NumCast(presTargetDoc._viewScale) * this.checkList(presTargetDoc, presTargetDoc["viewfinder-left-indexed"]) + NumCast(presTargetDoc._panX) + (this.checkList(presTargetDoc, presTargetDoc["viewfinder-width-indexed"]) / 2));
                    // srcContext._panY = newPanY + (NumCast(presTargetDoc._viewScale) * this.checkList(presTargetDoc, presTargetDoc["viewfinder-top-indexed"]) + NumCast(presTargetDoc._panY) + (this.checkList(presTargetDoc, presTargetDoc["viewfinder-height-indexed"]) / 2));
                    srcContext._panX = newPanX + (this.checkList(presTargetDoc, presTargetDoc["viewfinder-left-indexed"]) + (this.checkList(presTargetDoc, presTargetDoc["viewfinder-width-indexed"]) / 2));
                    srcContext._panY = newPanY + (this.checkList(presTargetDoc, presTargetDoc["viewfinder-top-indexed"]) + (this.checkList(presTargetDoc, presTargetDoc["viewfinder-height-indexed"]) / 2));
                    // srcContext._panX = newPanX
                    // srcContext._panY = newPanY
                    srcContext._viewScale = newScale;
                    console.log("X: " + srcContext._panX + ", Y: " + srcContext._panY + ", Scale: " + srcContext._viewScale);
                    const resize = document.getElementById('resizable');
                    if (resize) {
                        resize.style.width = this.checkList(presTargetDoc, presTargetDoc["viewfinder-width-indexed"]) + 'px';
                        resize.style.height = this.checkList(presTargetDoc, presTargetDoc["viewfinder-height-indexed"]) + 'px';
                        resize.style.top = this.checkList(presTargetDoc, presTargetDoc["viewfinder-top-indexed"]) + 'px';
                        resize.style.left = this.checkList(presTargetDoc, presTargetDoc["viewfinder-left-indexed"]) + 'px';
                    }
                }
            }
            // Case 2: No more frames in current doc and next slide is defined, therefore move to next slide
        } else if (this.childDocs[this.itemIndex + 1] !== undefined) {
            const nextSelected = this.itemIndex + 1;
            this.gotoDocument(nextSelected, this.itemIndex);

            // for (nextSelected = nextSelected + 1; nextSelected < this.childDocs.length; nextSelected++) {
            //     if (!this.childDocs[nextSelected].groupButton) {
            //         break;
            //     } else {
            //         this.gotoDocument(nextSelected, this.itemIndex);
            //     }
            // }
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
            // for (; !didZoom && prevSelected > 0 && this.childDocs[prevSelected].groupButton; prevSelected--) {
            //     didZoom = this.childDocs[prevSelected].zoomButton;
            // }
            prevSelected = Math.max(0, prevSelected - 1);

            this.gotoDocument(prevSelected, this.itemIndex);
        }
    }


    @action
    onHideDocumentUntilPressClick = () => {
        this.childDocs.forEach((doc, index) => {
            const curDoc = Cast(doc, Doc, null);
            const tagDoc = Cast(curDoc.presentationTargetDoc, Doc, null);
            if (tagDoc.presEffect === 'None' || !tagDoc.presEffect) {
                tagDoc.opacity = 1;
            } else {
                if (index <= this.itemIndex) {
                    tagDoc.opacity = 1;
                } else {
                    tagDoc.opacity = 0;
                }
            }
        });
    }

    /**
     * This is the method that checks for the actions that need to be performed
     * before the document has been presented, which involves 3 button options:
     * Hide Until Presented, Hide After Presented, Fade After Presented
     */
    @action
    hideDocumentInPres = () => {
        this.updateCurrentPresentation();
        this.childDocs.forEach((doc, i) => {
            const tagDoc = Cast(doc.presentationTargetDoc, Doc, null);
            console.log("HB: " + doc.presHideTillShownButton);
            console.log("HA: " + doc.presHideAfterButton);
            if (doc.presHideTillShownButton) {
                if (i < this.itemIndex) {
                    console.log(i + 1 + "hide before");
                    tagDoc.opacity = 0;
                    console.log(tagDoc.opacity);
                } else {
                    tagDoc.opacity = 1;
                }
            }
            if (doc.presHideAfterButton) {
                if (i > this.itemIndex) {
                    console.log(i + 1 + "hide after");
                    tagDoc.opacity = 0;
                    console.log(tagDoc.opacity);
                } else {
                    tagDoc.opacity = 1;
                }
            }
        });
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
        });
    }

    /**
     * This method makes sure that cursor navigates to the element that
     * has the option open and last in the group. If not in the group, and it has
     * the option open, navigates to that element.
     */
    navigateToElement = async (curDoc: Doc) => {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
        const srcContext = await DocCastAsync(targetDoc.context);
        const presCollection = Cast(this.layoutDoc.presCollection, Doc, null);
        const collectionDocView = presCollection ? DocumentManager.Instance.getDocumentView(presCollection) : undefined;
        if (this.itemIndex >= 0) {
            if (targetDoc) {
                if (srcContext) this.layoutDoc.presCollection = srcContext;
            } else if (targetDoc) this.layoutDoc.presCollection = targetDoc;
        }
        if (srcContext) console.log("NC: " + srcContext.title);
        if (presCollection) console.log("PC: " + presCollection.title);
        if (collectionDocView) {
            if (srcContext && srcContext !== presCollection) {
                console.log("Case 1: new srcContext inside of current collection so add a new tab to the current pres collection");
                console.log(collectionDocView);
                collectionDocView.props.addDocTab(srcContext, "inPlace");
            }
        } else if (srcContext) {
            console.log("Case 2: srcContext - not open and collection containing this document exists, so open collection that contains it and then await zooming in on document");
            this.props.addDocTab(srcContext, "onRight");
        } else if (!srcContext) {
            console.log("Case 3: !srcContext - no collection containing this document, therefore open document itself on right");
            this.props.addDocTab(targetDoc, "onRight");
        }
        this.updateCurrentPresentation();
        const docToJump = curDoc;
        const willZoom = false;

        //docToJump stayed same meaning, it was not in the group or was the last element in the group
        if (docToJump === curDoc) {
            //checking if curDoc has navigation open
            if (curDoc.presNavButton && targetDoc) {
                await DocumentManager.Instance.jumpToDocument(targetDoc, false, undefined, srcContext);
            } else if (curDoc.presZoomButton && targetDoc) {
                //awaiting jump so that new scale can be found, since jumping is async
                await DocumentManager.Instance.jumpToDocument(targetDoc, true, undefined, srcContext);
            }
        } else {
            //awaiting jump so that new scale can be found, since jumping is async
            targetDoc && await DocumentManager.Instance.jumpToDocument(targetDoc, willZoom, undefined, srcContext);
        }
    }

    //The function that is called when a document is clicked or reached through next or back.
    //it'll also execute the necessary actions if presentation is playing.
    public gotoDocument = action((index: number, fromDoc: number) => {
        this.updateCurrentPresentation();
        Doc.UnBrushAllDocs();
        if (index >= 0 && index < this.childDocs.length) {
            this.rootDoc._itemIndex = index;
            const presTargetDoc = Cast(this.childDocs[this.itemIndex].presentationTargetDoc, Doc, null);
            if (presTargetDoc?.lastFrame !== undefined) {
                presTargetDoc.currentFrame = 0;
            }
            this.navigateToElement(this.childDocs[index]);
            this._selectedArray = [this.childDocs[index]];
            // this.hideIfNotPresented(index);
            // this.showAfterPresented(index);
            // this.hideDocumentInPres();
            this.onHideDocumentUntilPressClick();
        }
    });


    @observable _presTimer!: NodeJS.Timeout;

    //The function that starts or resets presentaton functionally, depending on status flag.
    @action
    startOrResetPres = (startSlide: number) => {
        this.updateCurrentPresentation();
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
        if (this.layoutDoc.presStatus === "auto") {
            if (this._presTimer) clearInterval(this._presTimer);
            this.layoutDoc.presStatus = "manual";
        } else {
            this.layoutDoc.presStatus = "auto";
            this.startPresentation(startSlide);
            this.gotoDocument(startSlide, this.itemIndex);
            this._presTimer = setInterval(() => {
                if (this.itemIndex + 1 < this.childDocs.length) this.next();
                else {
                    clearInterval(this._presTimer);
                    this.layoutDoc.presStatus = "manual";
                }
            }, targetDoc.presDuration ? NumCast(targetDoc.presDuration) + NumCast(targetDoc.presTransition) : 2000);
        }
    }

    //The function that resets the presentation by removing every action done by it. It also
    //stops the presentaton.
    resetPresentation = () => {
        this.updateCurrentPresentation();
        this.childDocs.forEach(doc => (doc.presentationTargetDoc as Doc).opacity = 1);
        this.rootDoc._itemIndex = 0;
        // this.layoutDoc.presStatus = false;
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

    updateMinimize = () => {
        const srcContext = Cast(this.rootDoc.presCollection, Doc, null);
        if (srcContext) {
            if (srcContext.miniPres) {
                document.removeEventListener("keydown", this.keyEvents, false);
                srcContext.miniPres = false;
                // Doc.RemoveDocFromList((Doc.UserDoc().myOverlayDocuments as Doc), undefined, this.rootDoc);
                CollectionDockingView.AddRightSplit(this.rootDoc);
                // this.layoutDoc.inOverlay = false;
            } else {
                document.addEventListener("keydown", this.keyEvents, false);
                srcContext.miniPres = true;
                this.props.addDocTab?.(this.rootDoc, "close");
                // Doc.AddDocToList((Doc.UserDoc().myOverlayDocuments as Doc), undefined, this.rootDoc);
            }
        }
        // if (srcContext) {
        //     Doc.RemoveDocFromList((Doc.UserDoc().myOverlayDocuments as Doc), undefined, this.rootDoc);
        //     CollectionDockingView.AddRightSplit(this.rootDoc);
        //     this.layoutDoc.inOverlay = false;
        // }
        // else {
        //         const pt = this.props.ScreenToLocalTransform().inverse().transformPoint(0, 0);
        //         this.rootDoc.x = pt[0];// 500;//e.clientX + 25;
        //         this.rootDoc.y = pt[1];////e.clientY - 25;
        //         this.props.addDocTab?.(this.rootDoc, "close");
        //         Doc.AddDocToList((Doc.UserDoc().myOverlayDocuments as Doc), undefined, this.rootDoc);
        //     }
        // }
    }

    @undoBatch
    viewChanged = action((e: React.ChangeEvent) => {
        //@ts-ignore
        const viewType = e.target.selectedOptions[0].value as CollectionViewType;
        viewType === CollectionViewType.Stacking && (this.rootDoc._pivotField = undefined); // pivot field may be set by the user in timeline view (or some other way) -- need to reset it here
        // this.updateMinimize(this.rootDoc._viewType = viewType);
        if (viewType === CollectionViewType.Stacking) this.layoutDoc._gridGap = 5;
    });

    @undoBatch
    movementChanged = action((movement: string) => {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
        if (movement === 'zoom') {
            activeItem.presZoomButton = !activeItem.presZoomButton;
            if (activeItem.presZoomButton) activeItem.presMovement = 'Zoom';
            else activeItem.presMovement = 'None';
            activeItem.presNavButton = false;
        } else if (movement === 'nav') {
            activeItem.presZoomButton = false;
            activeItem.presNavButton = !activeItem.presNavButton;
            if (activeItem.presNavButton) activeItem.presMovement = 'Pan';
            else activeItem.presMovement = 'None';
        } else if (movement === 'switch') {
            targetDoc.presTransition = 0;
            activeItem.presSwitchButton = !activeItem.presSwitchButton;
            if (activeItem.presSwitchButton) activeItem.presMovement = 'Switch';
            else activeItem.presMovement = 'None';
        } else {
            activeItem.presMovement = 'None';
            activeItem.presZoomButton = false;
            activeItem.presNavButton = false;
            activeItem.presSwitchButton = false;
        }
    });

    whenActiveChanged = action((isActive: boolean) => this.props.whenActiveChanged(this._isChildActive = isActive));
    addDocumentFilter = (doc: Doc | Doc[]) => {
        const docs = doc instanceof Doc ? [doc] : doc;
        docs.forEach((doc, i) => {
            if (this.childDocs.includes(doc)) {
                console.log(docs.length);
                console.log(i + 1);
                if (docs.length === i + 1) return false;
            } else {
                doc.aliasOf instanceof Doc && (doc.presentationTargetDoc = doc.aliasOf);
                !this.childDocs.includes(doc) && (doc.presZoomButton = true);
            }
        });
        return true;
    }
    childLayoutTemplate = () => this.rootDoc._viewType !== CollectionViewType.Stacking ? undefined : this.presElement;
    removeDocument = (doc: Doc) => Doc.RemoveDocFromList(this.dataDoc, this.fieldKey, doc);
    getTransform = () => this.props.ScreenToLocalTransform().translate(-5, -65);// listBox padding-left and pres-box-cont minHeight
    panelHeight = () => this.props.PanelHeight() - 40;
    active = (outsideReaction?: boolean) => ((Doc.GetSelectedTool() === InkTool.None && !this.layoutDoc.isBackground) &&
        (this.layoutDoc.forceActive || this.props.isSelected(outsideReaction) || this._isChildActive || this.props.renderDepth === 0) ? true : false)

    // KEYS
    @observable _selectedArray: Doc[] = [];
    @observable _eleArray: HTMLElement[] = [];

    @computed get listOfSelected() {
        const list = this._selectedArray.map((doc: Doc, index: any) => {
            const activeItem = Cast(doc, Doc, null);
            const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
            return (
                <div className="selectedList-items">{index + 1}.  {targetDoc.title}</div>
            );
        });
        return list;
    }

    //Regular click
    @action
    selectElement = (doc: Doc) => {
        // this._selectedArray = [];
        this.gotoDocument(this.childDocs.indexOf(doc), NumCast(this.itemIndex));
        // this._selectedArray.push(this.childDocs[this.childDocs.indexOf(doc)]);
        // console.log(this._selectedArray);
    }

    //Command click
    @action
    multiSelect = (doc: Doc, ref: HTMLElement) => {
        this._selectedArray.push(this.childDocs[this.childDocs.indexOf(doc)]);
        this._eleArray.push(ref);
    }

    //Shift click
    @action
    shiftSelect = (doc: Doc, ref: HTMLElement) => {
        this._selectedArray = [];
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        if (activeItem) {
            for (let i = Math.min(this.itemIndex, this.childDocs.indexOf(doc)); i <= Math.max(this.itemIndex, this.childDocs.indexOf(doc)); i++) {
                this._selectedArray.push(this.childDocs[i]);
                this._eleArray.push(ref);
            }
        }
    }



    //Esc click
    @action
    keyEvents = (e: KeyboardEvent) => {
        e.stopPropagation();
        e.preventDefault();
        // switch(e.keyCode) {
        //     case 27: console.log("escape");
        //     case 65 && (e.metaKey || e.altKey):
        // }
        // Escape key
        if (e.keyCode === 27) {
            if (this.layoutDoc.presStatus === "edit") this._selectedArray = [];
            else this.layoutDoc.presStatus = "edit";
            // Ctrl-A to select all
        } if ((e.metaKey || e.altKey) && e.keyCode === 65) {
            if (this.layoutDoc.presStatus === "edit") this._selectedArray = this.childDocs;
            // left(37) / a(65) / up(38) to go back
        } if (e.keyCode === 37) {
            if (this.layoutDoc.presStatus !== "edit") this.back();
            // right (39) / d(68) / down(40) to go to next
        } if (e.keyCode === 39) {
            if (this.layoutDoc.presStatus !== "edit") this.next();
            // spacebar to 'present' or go to next slide
        } if (e.keyCode === 32) {
            if (this.layoutDoc.presStatus !== "edit") this.next();
            else this.layoutDoc.presStatus = "manual";
        }
    }

    @observable private transitionTools: boolean = false;
    @observable private newDocumentTools: boolean = false;
    @observable private progressivizeTools: boolean = false;
    @observable private moreInfoTools: boolean = false;
    @observable private playTools: boolean = false;
    @observable private presentTools: boolean = false;
    @observable private pathBoolean: boolean = false;
    @observable private expandBoolean: boolean = false;

    // For toggling transition toolbar
    @action toggleTransitionTools = () => {
        this.transitionTools = !this.transitionTools;
        this.newDocumentTools = false;
        this.progressivizeTools = false;
        this.moreInfoTools = false;
        this.playTools = false;
    }
    // For toggling the add new document dropdown
    @action toggleNewDocument = () => {
        this.newDocumentTools = !this.newDocumentTools;
        this.transitionTools = false;
        this.progressivizeTools = false;
        this.moreInfoTools = false;
        this.playTools = false;
    }
    // For toggling the tools for progressivize
    @action toggleProgressivize = () => {
        this.progressivizeTools = !this.progressivizeTools;
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
        targetDoc.editZoomProgressivize = false;
        targetDoc.editProgressivize = false;
        this.transitionTools = false;
        this.newDocumentTools = false;
        this.moreInfoTools = false;
        this.playTools = false;
    }
    // For toggling the tools for more info
    @action toggleMoreInfo = () => {
        this.moreInfoTools = !this.moreInfoTools;
        this.transitionTools = false;
        this.newDocumentTools = false;
        this.progressivizeTools = false;
        this.playTools = false;
    }
    // For toggling the options when the user wants to select play
    @action togglePlay = () => {
        this.playTools = !this.playTools;
        this.transitionTools = false;
        this.newDocumentTools = false;
        this.progressivizeTools = false;
        this.moreInfoTools = false;
    }

    // For toggling the options when the user wants to select play
    @action togglePresent = () => {
        this.presentTools = !this.presentTools;
        this.playTools = false;
        this.transitionTools = false;
        this.newDocumentTools = false;
        this.progressivizeTools = false;
        this.moreInfoTools = false;
    }

    @action toggleAllDropdowns() {
        this.transitionTools = false;
        this.newDocumentTools = false;
        this.progressivizeTools = false;
        this.moreInfoTools = false;
        this.playTools = false;
    }

    @undoBatch
    @action
    viewPaths = async () => {
        const srcContext = Cast(this.rootDoc.presCollection, Doc, null);
        if (this.pathBoolean) {
            console.log("true");
            if (srcContext) {
                this.togglePath();
                srcContext._fitToBox = false;
                srcContext._viewType = "freeform";
                srcContext.presPathView = false;
            }
        } else {
            console.log("false");
            if (srcContext) {
                this.togglePath();
                srcContext._fitToBox = true;
                srcContext._viewType = "freeform";
                srcContext.presPathView = true;
            }
        }
        console.log("view paths");
        const viewType = srcContext?._viewType;
        const fit = srcContext?._fitToBox;

        // if (!DocumentManager.Instance.getDocumentView(curPres)) {
        //     CollectionDockingView.AddRightSplit(curPres);
        // }
    }

    @computed get order() {
        const order: JSX.Element[] = [];
        this.childDocs.forEach((doc, index) => {
            const targetDoc = Cast(doc.presentationTargetDoc, Doc, null);
            const srcContext = Cast(targetDoc.context, Doc, null);
            if (this.rootDoc.presCollection === srcContext) {
                order.push(
                    <div className="pathOrder" style={{ top: NumCast(targetDoc.y), left: NumCast(targetDoc.x) }}>
                        <div className="pathOrder-frame">{index + 1}</div>
                    </div>);
            } else {
                order.push(
                    <div className="pathOrder" style={{ top: 0, left: 0 }}>
                        <div className="pathOrder-frame">{index + 1}</div>
                    </div>);
            }
        });
        return order;
    }

    @computed get paths() {
        let pathPoints = "";
        console.log(this.childDocs.length - 1);
        this.childDocs.forEach((doc, index) => {
            const targetDoc = Cast(doc.presentationTargetDoc, Doc, null);
            const srcContext = Cast(targetDoc.context, Doc, null);
            if (targetDoc && this.rootDoc.presCollection === srcContext) {
                const n1x = NumCast(targetDoc.x) + (NumCast(targetDoc._width) / 2);
                const n1y = NumCast(targetDoc.y) + (NumCast(targetDoc._height) / 2);
                if (index = 0) pathPoints = n1x + "," + n1y;
                else pathPoints = pathPoints + " " + n1x + "," + n1y;
            } else {
                if (index = 0) pathPoints = 0 + "," + 0;
                else pathPoints = pathPoints + " " + 0 + "," + 0;
            }
        });
        console.log(pathPoints);
        return (<polyline
            points={pathPoints}
            style={{
                opacity: 1,
                stroke: "#69a6db",
                strokeWidth: 5,
                strokeDasharray: '10 5',
            }}
            fill="none"
            markerStart="url(#markerSquare)"
            markerMid="url(#markerSquare)"
            markerEnd="url(#markerArrow)"
        />);
    }

    @action togglePath = () => this.pathBoolean = !this.pathBoolean;
    @action toggleExpand = () => this.expandBoolean = !this.expandBoolean;

    /**
     * The function that is called on click to turn fading document after presented option on/off.
     * It also makes sure that the option swithches from hide-after to this one, since both
     * can't coexist.
     */
    @action
    onFadeDocumentAfterPresentedClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
        activeItem.presFadeButton = !activeItem.presFadeButton;
        if (!activeItem.presFadeButton) {
            if (targetDoc) {
                targetDoc.opacity = 1;
            }
        } else {
            activeItem.presHideAfterButton = false;
            if (this.rootDoc.presStatus !== "edit" && targetDoc) {
                targetDoc.opacity = 0.5;
            }
        }
    }

    @action
    dropdownToggle = (menu: string) => {
        console.log('presBox' + menu + 'Dropdown');
        const dropMenu = document.getElementById('presBox' + menu + 'Dropdown');
        console.log(dropMenu);
        console.log(dropMenu?.style.display);
        if (dropMenu) dropMenu.style.display === 'none' ? dropMenu.style.display = 'block' : dropMenu.style.display = 'none';
    }

    setTransitionTime = (number: String) => {
        const timeInMS = Number(number) * 1000;
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
        if (targetDoc) targetDoc.presTransition = timeInMS;
    }

    setDurationTime = (number: String) => {
        const timeInMS = Number(number) * 1000;
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
        if (targetDoc) targetDoc.presDuration = timeInMS;
    }

    @computed get transitionDropdown() {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem?.presentationTargetDoc, Doc, null);
        if (activeItem && targetDoc) {
            const transitionSpeed = targetDoc.presTransition ? String(Number(targetDoc.presTransition) / 1000) : 0.5;
            const duration = targetDoc.presDuration ? String(Number(targetDoc.presDuration) / 1000) : 2;
            const transitionThumbLocation = String(-9.48 * Number(transitionSpeed) + 93);
            const durationThumbLocation = String(9.48 * Number(duration));
            const effect = targetDoc.presEffect ? targetDoc.presEffect : 'None';
            activeItem.presMovement = activeItem.presMovement ? activeItem.presMovement : 'Zoom';
            return (
                <div className={`presBox-ribbon ${this.transitionTools && this.layoutDoc.presStatus === "edit" ? "active" : ""}`} onClick={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                    <div className="ribbon-box">
                        Movement
                        <div className="presBox-dropdown"
                            onPointerDown={e => e.stopPropagation()}
                        // onClick={() => this.dropdownToggle('Movement')}
                        >
                            {activeItem.presMovement}
                            <FontAwesomeIcon className='presBox-dropdownIcon' style={{ gridColumn: 2 }} icon={"angle-down"} />
                            <div className={'presBox-dropdownOptions'} id={'presBoxMovementDropdown'} onClick={e => e.stopPropagation()}>
                                <div className={`presBox-dropdownOption ${activeItem.presMovement === 'None' ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.movementChanged('none')}>None</div>
                                <div className={`presBox-dropdownOption ${activeItem.presMovement === 'Zoom' ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.movementChanged('zoom')}>Pan and Zoom</div>
                                <div className={`presBox-dropdownOption ${activeItem.presMovement === 'Pan' ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.movementChanged('nav')}>Pan</div>
                                <div className={`presBox-dropdownOption ${activeItem.presMovement === 'Switch' ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.movementChanged('switch')}>Switch</div>
                            </div>
                        </div>
                        <input type="range" step="0.1" min="0.1" max="10" value={transitionSpeed} className={`toolbar-slider ${activeItem.presMovement === 'Pan' || activeItem.presMovement === 'Zoom' ? "" : "none"}`} id="toolbar-slider" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { e.stopPropagation(); this.setTransitionTime(e.target.value); }} />
                        <div className={`slider-headers ${activeItem.presMovement === 'Pan' || activeItem.presMovement === 'Zoom' ? "" : "none"}`}>
                            <div className={`slider-value ${activeItem.presZoomButton || activeItem.presNavButton ? "" : "none"}`} style={{ left: transitionThumbLocation + '%' }}>{transitionSpeed}s</div>
                            <div className="slider-text">Slow</div>
                            <div className="slider-text"></div>
                            <div className="slider-text">Fast</div>
                        </div>
                    </div>
                    <div className="ribbon-box">
                        Visibility
                        <div className="ribbon-doubleButton">
                            <Tooltip title={<><div className="dash-tooltip">{"Hide before presented"}</div></>}><div className={`ribbon-button ${activeItem.presHideTillShownButton ? "active" : ""}`} onClick={() => activeItem.presHideTillShownButton = !activeItem.presHideTillShownButton}>HB</div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Hide after presented"}</div></>}><div className={`ribbon-button ${activeItem.presHideAfterButton ? "active" : ""}`} onClick={() => activeItem.presHideAfterButton = !activeItem.presHideAfterButton}>HA</div></Tooltip>
                        </div>
                        <input type="range" step="0.1" min="0.1" max="10" value={duration} style={{ transform: 'rotate(0deg)' }} className={"toolbar-slider"} id="duration-slider" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { e.stopPropagation(); this.setDurationTime(e.target.value); }} />
                        <div className={"slider-headers"}>
                            <div className={"slider-value"} style={{ left: durationThumbLocation + '%' }}>{duration}s</div>
                            <div className="slider-text">Short</div>
                            <div className="slider-text"></div>
                            <div className="slider-text">Long</div>
                        </div>
                    </div>
                    <div className="ribbon-box">
                        Effects
                        <div className="presBox-dropdown"
                            onPointerDown={e => e.stopPropagation()}
                        >
                            {effect}
                            <FontAwesomeIcon className='presBox-dropdownIcon' style={{ gridColumn: 2 }} icon={"angle-down"} />
                            <div className={'presBox-dropdownOptions'} id={'presBoxMovementDropdown'} onClick={e => e.stopPropagation()}>
                                <div className={'presBox-dropdownOption'} onPointerDown={e => e.stopPropagation()} onClick={() => targetDoc.presEffect = 'None'}>None</div>
                                <div className={'presBox-dropdownOption'} onPointerDown={e => e.stopPropagation()} onClick={() => targetDoc.presEffect = 'Fade'}>Fade In</div>
                                <div className={'presBox-dropdownOption'} onPointerDown={e => e.stopPropagation()} onClick={() => targetDoc.presEffect = 'Flip'}>Flip</div>
                                <div className={'presBox-dropdownOption'} onPointerDown={e => e.stopPropagation()} onClick={() => targetDoc.presEffect = 'Rotate'}>Rotate</div>
                                <div className={'presBox-dropdownOption'} onPointerDown={e => e.stopPropagation()} onClick={() => targetDoc.presEffect = 'Bounce'}>Bounce</div>
                                <div className={'presBox-dropdownOption'} onPointerDown={e => e.stopPropagation()} onClick={() => targetDoc.presEffect = 'Roll'}>Roll</div>
                            </div>
                        </div>
                        <div className="effectDirection" style={{ display: effect === 'None' ? "none" : "grid" }}>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from left"}</div></>}><div style={{ gridColumn: 1, gridRow: 2, justifySelf: 'center', color: targetDoc.presEffectDirection === "left" ? "#5a9edd" : "black" }} onClick={() => targetDoc.presEffectDirection = 'left'}><FontAwesomeIcon icon={"angle-right"} /></div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from right"}</div></>}><div style={{ gridColumn: 3, gridRow: 2, justifySelf: 'center', color: targetDoc.presEffectDirection === "right" ? "#5a9edd" : "black" }} onClick={() => targetDoc.presEffectDirection = 'right'}><FontAwesomeIcon icon={"angle-left"} /></div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from top"}</div></>}><div style={{ gridColumn: 2, gridRow: 1, justifySelf: 'center', color: targetDoc.presEffectDirection === "top" ? "#5a9edd" : "black" }} onClick={() => targetDoc.presEffectDirection = 'top'}><FontAwesomeIcon icon={"angle-down"} /></div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from bottom"}</div></>}><div style={{ gridColumn: 2, gridRow: 3, justifySelf: 'center', color: targetDoc.presEffectDirection === "bottom" ? "#5a9edd" : "black" }} onClick={() => targetDoc.presEffectDirection = 'bottom'}><FontAwesomeIcon icon={"angle-up"} /></div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from center"}</div></>}><div style={{ gridColumn: 2, gridRow: 2, width: 10, height: 10, alignSelf: 'center', justifySelf: 'center', border: targetDoc.presEffectDirection ? "solid 2px black" : "solid 2px #5a9edd", borderRadius: "100%" }} onClick={() => targetDoc.presEffectDirection = false}></div></Tooltip>
                        </div>
                    </div>
                    <div className="ribbon-final-box">
                        {this._selectedArray.length} selected
                        <div className="selectedList">
                            {this.listOfSelected}
                        </div>
                    </div>
                    <div className="ribbon-final-box">
                        <div className={this._selectedArray.length === 0 ? "ribbon-final-button" : "ribbon-final-button-hidden"} onClick={() => this.applyTo(this._selectedArray)}>
                            Apply to selected
                        </div>
                        <div className="ribbon-final-button-hidden" onClick={() => this.applyTo(this.childDocs)}>
                            Apply to all
                        </div>
                    </div>
                </div>
            );
        }
    }

    applyTo = (array: Doc[]) => {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem?.presentationTargetDoc, Doc, null);
        array.forEach((doc, index) => {
            const curDoc = Cast(doc, Doc, null);
            const tagDoc = Cast(curDoc.presentationTargetDoc, Doc, null);
            if (tagDoc && targetDoc) {
                tagDoc.presTransition = targetDoc.presTransition;
                tagDoc.presDuration = targetDoc.presDuration;
                tagDoc.presEffect = targetDoc.presEffect;
            }
        });
    }

    public inputRef = React.createRef<HTMLInputElement>();


    createNewSlide = (title: string, type: string) => {
        let doc = null;
        if (type === "text") {
            doc = Docs.Create.TextDocument("", { _nativeWidth: 400, _width: 400, title: title });
            const data = Cast(this.rootDoc.data, listSpec(Doc));
            if (data) data.push(doc);
        } else {
            doc = Docs.Create.FreeformDocument([], { _nativeWidth: 400, _width: 400, title: title });
            const data = Cast(this.rootDoc.data, listSpec(Doc));
            if (data) data.push(doc);
        }
    }

    @computed get newDocumentDropdown() {
        let type = "";
        let title = "";
        return (
            <div>
                <div className={`presBox-ribbon ${this.newDocumentTools && this.layoutDoc.presStatus === "edit" ? "active" : ""}`} onClick={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                    <div className="ribbon-box">
                        Slide Title: <br></br>
                        {/* <div className="dropdown-textInput"> */}
                        <input className="ribbon-textInput" placeholder="..." type="text" name="fname" ref={this.inputRef} onChange={(e) => {
                            e.stopPropagation();
                            title = e.target.value;
                        }}></input>
                        {/* </div> */}
                    </div>
                    <div className="ribbon-box">
                        Choose type:
                        <div style={{ display: 'block', alignSelf: 'center' }}>
                            <div title="Text" className={'ribbon-button'} style={{ background: type === 'text' ? "#000000" : "#f6f6f6" }} onClick={action(() => { type = "text"; })}>Text</div>
                            <div title="Freeform" className={'ribbon-button'} style={{ background: type === 'freeform' ? "#000000" : "#f6f6f6" }} onClick={action(() => { type = "freeform"; })}>Freeform</div>
                        </div>
                    </div>
                    <div className="ribbon-box">
                        Preset layouts:
                        <div className="layout-container">
                            <div className="layout">
                                <div className="header">HEADER</div>
                                <div className="subheader">Content goes here</div>
                            </div>
                            <div className="layout">
                                <div className="header" style={{ gridColumn: 1 / 2, gridRow: 1 }}>HEADER</div>
                                <div className="subheader" style={{ gridColumn: 1, gridRow: 2 }}>Some content</div>
                                <div className="subheader" style={{ gridColumn: 2, gridRow: 2 }}>Some more content</div>
                            </div>
                            <div className="layout">
                                <div className="header">HEADER</div>
                                <div className="subheader">Content goes here</div>
                            </div>
                        </div>
                    </div>
                    <div className="ribbon-final-box">
                        <div className="ribbon-final-button" onClick={() => this.createNewSlide(title, type)}>
                            Create New Slide
                        </div>
                    </div>
                </div>
            </div >
        );
    }

    @computed get playDropdown() {
        return (
            <div className={`dropdown-play ${this.playTools ? "active" : ""}`} onClick={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                <div className="dropdown-play-button" onClick={() => this.startOrResetPres(this.itemIndex)}>
                    Present from current slide
                </div>
                <div className="dropdown-play-button" onClick={() => this.startOrResetPres(0)}>
                    Present from first slide
                </div>
            </div>
        );
    }

    @computed get presentDropdown() {
        return (
            <div className={`dropdown-play ${this.presentTools ? "active" : ""}`} onClick={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                <div className="dropdown-play-button" onClick={this.updateMinimize}>
                    Minimize
                </div>
                <div className="dropdown-play-button" onClick={() => this.startOrResetPres(0)}>
                    Sidebar view
                </div>
            </div>
        );
    }

    // progressivizeOptions = (viewType: string) => {
    //     const buttons = [];
    //     buttons.push(<div className="ribbon-button" onClick={this.progressivize}>Child documents</div>);
    //     buttons.push(<div className="ribbon-button" onClick={() => console.log("hide after")}>Internal zoom</div>);
    //     buttons.push(<div className="ribbon-button" onClick={() => console.log("hide after")}>Bullet points</div>);
    //     if (viewType === "rtf") {
    //         buttons.push(<div className="ribbon-button" title="Progressivize bullet points" onClick={() => console.log("hide after")}>Bullet points</div>);
    //     }
    //     return buttons;
    // }

    @undoBatch
    @action
    nextKeyframe = (tagDoc: Doc): void => {
        const childDocs = DocListCast(tagDoc[Doc.LayoutFieldKey(tagDoc)]);
        const currentFrame = Cast(tagDoc.currentFrame, "number", null);
        if (currentFrame === undefined) {
            tagDoc.currentFrame = 0;
            CollectionFreeFormDocumentView.setupScroll(tagDoc, 0);
            CollectionFreeFormDocumentView.setupKeyframes(childDocs, 0);
        }
        let lastFrame: number = 0;
        childDocs.forEach((doc) => {
            if (NumCast(doc.appearFrame) > lastFrame) lastFrame = NumCast(doc.appearFrame);
        });
        CollectionFreeFormDocumentView.updateScrollframe(tagDoc, currentFrame);
        CollectionFreeFormDocumentView.updateKeyframe(childDocs, currentFrame || 0);
        tagDoc.currentFrame = Math.max(0, (currentFrame || 0) + 1);
        tagDoc.lastFrame = Math.max(NumCast(tagDoc.currentFrame), lastFrame);
        if (tagDoc.zoomProgressivize) {
            const resize = document.getElementById('resizable');
            if (resize) {
                resize.style.width = this.checkList(tagDoc, tagDoc["viewfinder-width-indexed"]) + 'px';
                resize.style.height = this.checkList(tagDoc, tagDoc["viewfinder-height-indexed"]) + 'px';
                resize.style.top = this.checkList(tagDoc, tagDoc["viewfinder-top-indexed"]) + 'px';
                resize.style.left = this.checkList(tagDoc, tagDoc["viewfinder-left-indexed"]) + 'px';
            }
        }
    }

    @undoBatch
    @action
    prevKeyframe = (tagDoc: Doc): void => {
        const childDocs = DocListCast(tagDoc[Doc.LayoutFieldKey(tagDoc)]);
        const currentFrame = Cast(tagDoc.currentFrame, "number", null);
        if (currentFrame === undefined) {
            tagDoc.currentFrame = 0;
            CollectionFreeFormDocumentView.setupKeyframes(childDocs, 0);
        }
        CollectionFreeFormDocumentView.gotoKeyframe(childDocs.slice());
        tagDoc.currentFrame = Math.max(0, (currentFrame || 0) - 1);
        if (tagDoc.zoomProgressivize) {
            const resize = document.getElementById('resizable');
            if (resize) {
                resize.style.width = this.checkList(tagDoc, tagDoc["viewfinder-width-indexed"]) + 'px';
                resize.style.height = this.checkList(tagDoc, tagDoc["viewfinder-height-indexed"]) + 'px';
                resize.style.top = this.checkList(tagDoc, tagDoc["viewfinder-top-indexed"]) + 'px';
                resize.style.left = this.checkList(tagDoc, tagDoc["viewfinder-left-indexed"]) + 'px';
            }
        }
    }

    @computed get progressivizeDropdown() {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem?.presentationTargetDoc, Doc, null);

        if (activeItem && targetDoc) {
            return (
                <div>
                    <div className={`presBox-ribbon ${this.progressivizeTools && this.layoutDoc.presStatus === "edit" ? "active" : ""}`} onClick={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                        <div className="ribbon-box">
                            {targetDoc.type} selected
                            <div className="selectedList" style={{ height: 'max-content' }}>
                                <div className="selectedList-items">{targetDoc.title}</div>
                            </div>
                            <div className="ribbon-doubleButton">
                                <div className="ribbon-frameSelector">
                                    <div key="back" title="back frame" className="backKeyframe" onClick={e => { e.stopPropagation(); this.prevKeyframe(targetDoc); }}>
                                        <FontAwesomeIcon icon={"caret-left"} size={"lg"} />
                                    </div>
                                    <div key="num" title="toggle view all" className="numKeyframe" style={{ backgroundColor: targetDoc.editing ? "#5a9edd" : "#5a9edd" }}
                                        onClick={action(() => targetDoc.editing = !targetDoc.editing)} >
                                        {NumCast(targetDoc.currentFrame)}
                                    </div>
                                    <div key="fwd" title="forward frame" className="fwdKeyframe" onClick={e => { e.stopPropagation(); this.nextKeyframe(targetDoc); }}>
                                        <FontAwesomeIcon icon={"caret-right"} size={"lg"} />
                                    </div>
                                </div>
                                <Tooltip title={<><div className="dash-tooltip">{"Last frame"}</div></>}><div style={{ fontWeight: 600, marginTop: 0, marginLeft: 3 }} className="ribbon-button">{NumCast(targetDoc.lastFrame)}</div></Tooltip>
                            </div>
                        </div>
                        <div className="ribbon-final-box">
                            <div className="ribbon-doubleButton" style={{ display: targetDoc.type === "collection" ? "inline-flex" : "none" }}>
                                <div className="ribbon-button" style={{ backgroundColor: activeItem.presProgressivize ? "#aedef8" : "" }} onClick={this.progressivizeChild}>Child documents</div>
                                <div className="ribbon-button" style={{ display: activeItem.presProgressivize ? "flex" : "none", backgroundColor: targetDoc.editProgressivize ? "#aedef8" : "" }} onClick={this.editProgressivize}>Edit</div>
                            </div>
                            <div className="ribbon-doubleButton" style={{ display: targetDoc.type === "collection" || targetDoc.type === "image" ? "inline-flex" : "none" }}>
                                <div className="ribbon-button" style={{ backgroundColor: activeItem.zoomProgressivize ? "#aedef8" : "" }} onClick={this.progressivizeZoom}>Internal zoom</div>
                                <div className="ribbon-button" style={{ display: activeItem.zoomProgressivize ? "flex" : "none", backgroundColor: targetDoc.editZoomProgressivize ? "#aedef8" : "" }} onClick={this.editZoomProgressivize}>Viewfinder</div>
                                <div className="ribbon-button" style={{ display: activeItem.zoomProgressivize ? "flex" : "none", backgroundColor: targetDoc.editSnapZoomProgressivize ? "#aedef8" : "" }} onClick={this.editSnapZoomProgressivize}>Snapshot</div>
                            </div>
                            <div className="ribbon-doubleButton" style={{ display: targetDoc.type === "rtf" ? "inline-flex" : "none" }}>
                                <div className="ribbon-button" onClick={this.progressivizeText}>Text progressivize</div>
                                <div className="ribbon-button" style={{ display: activeItem.textProgressivize ? "flex" : "none", backgroundColor: targetDoc.editTextProgressivize ? "#aedef8" : "" }} onClick={this.editTextProgressivize}>Edit</div>
                            </div>
                            <div className="ribbon-doubleButton" style={{ display: targetDoc.type === "pdf" ? "inline-flex" : "none" }}>
                                <div className="ribbon-button" style={{ backgroundColor: activeItem.scrollProgressivize ? "#aedef8" : "" }} onClick={this.progressivizeScroll}>Scroll progressivize</div>
                                <div className="ribbon-button" style={{ display: activeItem.scrollProgressivize ? "flex" : "none", backgroundColor: targetDoc.editScrollProgressivize ? "#aedef8" : "" }} onClick={this.editScrollProgressivize}>Edit</div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
    }

    //Toggle whether the user edits or not
    @action
    editSnapZoomProgressivize = (e: React.MouseEvent) => {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
        if (!targetDoc.editSnapZoomProgressivize) {
            targetDoc.editSnapZoomProgressivize = true;
        } else {
            targetDoc.editSnapZoomProgressivize = false;
        }

    }

    //Toggle whether the user edits or not
    @action
    editZoomProgressivize = (e: React.MouseEvent) => {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
        if (!targetDoc.editZoomProgressivize) {
            targetDoc.editZoomProgressivize = true;
        } else {
            targetDoc.editZoomProgressivize = false;
        }
    }

    //Toggle whether the user edits or not
    @action
    editScrollProgressivize = (e: React.MouseEvent) => {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
        if (!targetDoc.editScrollProgressivize) {
            targetDoc.editScrollProgressivize = true;
        } else {
            targetDoc.editScrollProgressivize = false;
        }
    }

    //Progressivize Zoom
    @action
    progressivizeScroll = (e: React.MouseEvent) => {
        e.stopPropagation();
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        activeItem.scrollProgressivize = !activeItem.scrollProgressivize;
        const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
        targetDoc.scrollProgressivize = !targetDoc.zoomProgressivize;
        CollectionFreeFormDocumentView.setupScroll(targetDoc, NumCast(targetDoc.currentFrame), true);
        if (targetDoc.editScrollProgressivize) {
            targetDoc.editScrollProgressivize = false;
            targetDoc.currentFrame = 0;
            targetDoc.lastFrame = 0;
        }
    }

    //Progressivize Zoom
    @action
    progressivizeZoom = (e: React.MouseEvent) => {
        e.stopPropagation();
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        activeItem.zoomProgressivize = !activeItem.zoomProgressivize;
        const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
        targetDoc.zoomProgressivize = !targetDoc.zoomProgressivize;
        CollectionFreeFormDocumentView.setupZoom(targetDoc, true);
        if (targetDoc.editZoomProgressivize) {
            targetDoc.editZoomProgressivize = false;
            targetDoc.currentFrame = 0;
            targetDoc.lastFrame = 0;
        }
    }

    //Progressivize Text nodes
    @action
    editTextProgressivize = (e: React.MouseEvent) => {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
        targetDoc.currentFrame = targetDoc.lastFrame;
        if (targetDoc?.editTextProgressivize) {
            targetDoc.editTextProgressivize = false;
        } else {
            targetDoc.editTextProgressivize = true;
        }
    }

    @action
    progressivizeText = (e: React.MouseEvent) => {
        e.stopPropagation();
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        activeItem.presProgressivize = !activeItem.presProgressivize;
        const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
        const docs = DocListCast(targetDoc[Doc.LayoutFieldKey(targetDoc)]);
        targetDoc.presProgressivize = !targetDoc.presProgressivize;
        console.log(targetDoc.presProgressivize);
        if (activeItem.presProgressivize) {
            console.log("progressivize");
            targetDoc.currentFrame = 0;
            CollectionFreeFormDocumentView.setupKeyframes(docs, docs.length, true);
            targetDoc.lastFrame = docs.length - 1;
        }
    }

    //Progressivize Child Docs
    @action
    editProgressivize = (e: React.MouseEvent) => {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
        targetDoc.currentFrame = targetDoc.lastFrame;
        if (targetDoc?.editProgressivize) {
            targetDoc.editProgressivize = false;
        } else {
            targetDoc.editProgressivize = true;
        }
    }

    @action
    progressivizeChild = (e: React.MouseEvent) => {
        e.stopPropagation();
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
        const docs = DocListCast(targetDoc[Doc.LayoutFieldKey(targetDoc)]);
        if (!activeItem.presProgressivize) {
            activeItem.presProgressivize = true;
            targetDoc.presProgressivize = true;
            targetDoc.currentFrame = 0;
            CollectionFreeFormDocumentView.setupKeyframes(docs, docs.length, true);
            targetDoc.lastFrame = docs.length - 1;
        } else {
            targetDoc.editProgressivize = false;
            activeItem.presProgressivize = false;
            targetDoc.presProgressivize = false;
            // docs.forEach((doc, index) => {
            //     doc.appearFrame = 0;
            // });
            targetDoc.currentFrame = 0;
            targetDoc.lastFrame = 0;
        }
    }

    @action
    checkMovementLists = (doc: Doc, xlist: any, ylist: any) => {
        const x: List<number> = xlist;
        const y: List<number> = ylist;
        const tags: JSX.Element[] = [];
        let pathPoints = ""; //List of all of the paths that need to be added
        // console.log(x);
        // console.log(x.length);
        // console.log(x[0]);
        for (let i = 0; i < x.length - 1; i++) {
            if (y[i] || x[i]) {
                if (i === 0) pathPoints = (x[i] - 11) + "," + (y[i] + 33);
                else pathPoints = pathPoints + " " + (x[i] - 11) + "," + (y[i] + 33);
                tags.push(<div className="progressivizeMove-frame" style={{ position: 'absolute', top: y[i], left: x[i] }}>{i}</div>);
            }
        }
        tags.push(<svg style={{ overflow: 'visible', position: 'absolute' }}><polyline
            points={pathPoints}
            style={{
                position: 'absolute',
                opacity: 1,
                stroke: "#000000",
                strokeWidth: 2,
                strokeDasharray: '10 5',
            }}
            fill="none"
        /></svg>);
        return tags;
    }

    @observable
    toggleDisplayMovement = (doc: Doc) => {
        if (doc.displayMovement) doc.displayMovement = false;
        else doc.displayMovement = true;
    }

    private _isDraggingTL = false;
    private _isDraggingTR = false;
    private _isDraggingBR = false;
    private _isDraggingBL = false;
    private _isDragging = false;
    // private _drag = "";

    // onPointerDown = (e: React.PointerEvent): void => {
    //     e.stopPropagation();
    //     e.preventDefault();
    //     if (e.button === 0) {
    //         this._drag = e.currentTarget.id;
    //         console.log(this._drag);
    //     }
    //     document.removeEventListener("pointermove", this.onPointerMove);
    //     document.addEventListener("pointermove", this.onPointerMove);
    //     document.removeEventListener("pointerup", this.onPointerUp);
    //     document.addEventListener("pointerup", this.onPointerUp);
    // }


    //Adds event listener so knows pointer is down and moving
    onPointerMid = (e: React.PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isDragging = true;
        document.removeEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointerup", this.onPointerUp);
    }

    //Adds event listener so knows pointer is down and moving
    onPointerBR = (e: React.PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isDraggingBR = true;
        document.removeEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointerup", this.onPointerUp);
    }

    //Adds event listener so knows pointer is down and moving
    onPointerBL = (e: React.PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isDraggingBL = true;
        document.removeEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointerup", this.onPointerUp);
    }

    //Adds event listener so knows pointer is down and moving
    onPointerTR = (e: React.PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isDraggingTR = true;
        document.removeEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointerup", this.onPointerUp);
    }

    //Adds event listener so knows pointer is down and moving
    onPointerTL = (e: React.PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isDraggingTL = true;
        document.removeEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointerup", this.onPointerUp);
    }

    //Removes all event listeners
    onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isDraggingTL = false;
        this._isDraggingTR = false;
        this._isDraggingBL = false;
        this._isDraggingBR = false;
        this._isDragging = false;
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }

    //Adjusts the value in NodeStore
    onPointerMove = (e: PointerEvent): void => {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem?.presentationTargetDoc, Doc, null);
        const tagDocView = DocumentManager.Instance.getDocumentView(targetDoc);
        e.stopPropagation();
        e.preventDefault();
        const doc = document.getElementById('resizable');
        if (doc && tagDocView) {

            const scale = tagDocView.childScaling();
            console.log("childScaling: " + scale);
            const scale2 = tagDocView.props.ScreenToLocalTransform().Scale;
            console.log("ScreenToLocal...Scale: " + scale2);
            let height = doc.offsetHeight;
            let width = doc.offsetWidth;
            let top = doc.offsetTop;
            let left = doc.offsetLeft;
            // const newHeightB = height += (e.movementY * NumCast(targetDoc._viewScale));
            // const newHeightT = height -= (e.movementY * NumCast(targetDoc._viewScale));
            // const newWidthR = width += (e.movementX * NumCast(targetDoc._viewScale));
            // const newWidthL = width -= (e.movementX * NumCast(targetDoc._viewScale));
            // const newLeft = left += (e.movementX * NumCast(targetDoc._viewScale));
            // const newTop = top += (e.movementY * NumCast(targetDoc._viewScale));
            // switch (this._drag) {
            //     case "": break;
            //     case "resizer-br":
            //         doc.style.height = newHeightB + 'px';
            //         doc.style.width = newWidthR + 'px';
            //         break;
            //     case "resizer-bl":
            //         doc.style.height = newHeightB + 'px';
            //         doc.style.width = newWidthL + 'px';
            //         doc.style.left = newLeft + 'px';
            //         break;
            //     case "resizer-tr":
            //         doc.style.width = newWidthR + 'px';
            //         doc.style.height = newHeightT + 'px';
            //         doc.style.top = newTop + 'px';
            //     case "resizer-tl":
            //         doc.style.width = newWidthL + 'px';
            //         doc.style.height = newHeightT + 'px';
            //         doc.style.top = newTop + 'px';
            //         doc.style.left = newLeft + 'px';
            //     case "resizable":
            //         doc.style.top = newTop + 'px';
            //         doc.style.left = newLeft + 'px';
            // }
            //Bottom right
            if (this._isDraggingBR) {
                const newHeight = height += (e.movementY * scale2);
                doc.style.height = newHeight + 'px';
                const newWidth = width += (e.movementX * scale2);
                doc.style.width = newWidth + 'px';
                // Bottom left
            } else if (this._isDraggingBL) {
                const newHeight = height += (e.movementY * scale);
                doc.style.height = newHeight + 'px';
                const newWidth = width -= (e.movementX * scale);
                doc.style.width = newWidth + 'px';
                const newLeft = left += (e.movementX * scale);
                doc.style.left = newLeft + 'px';
                // Top right
            } else if (this._isDraggingTR) {
                const newWidth = width += (e.movementX * tagDocView.props.ScreenToLocalTransform().Scale);
                doc.style.width = newWidth + 'px';
                const newHeight = height -= (e.movementY * tagDocView.props.ScreenToLocalTransform().Scale);
                doc.style.height = newHeight + 'px';
                const newTop = top += (e.movementY * tagDocView.props.ScreenToLocalTransform().Scale);
                doc.style.top = newTop + 'px';
                // Top left
            } else if (this._isDraggingTL) {
                const newWidth = width -= (e.movementX * tagDocView.props.ScreenToLocalTransform().Scale);
                doc.style.width = newWidth + 'px';
                const newHeight = height -= (e.movementY * tagDocView.props.ScreenToLocalTransform().Scale);
                doc.style.height = newHeight + 'px';
                const newTop = top += (e.movementY * tagDocView.props.ScreenToLocalTransform().Scale);
                doc.style.top = newTop + 'px';
                const newLeft = left += (e.movementX * tagDocView.props.ScreenToLocalTransform().Scale);
                doc.style.left = newLeft + 'px';
            } else if (this._isDragging) {
                const newTop = top += (e.movementY * tagDocView.props.ScreenToLocalTransform().Scale);
                doc.style.top = newTop + 'px';
                const newLeft = left += (e.movementX * tagDocView.props.ScreenToLocalTransform().Scale);
                doc.style.left = newLeft + 'px';
            }
            this.updateList(targetDoc, targetDoc["viewfinder-width-indexed"], width);
            this.updateList(targetDoc, targetDoc["viewfinder-height-indexed"], height);
            this.updateList(targetDoc, targetDoc["viewfinder-top-indexed"], top);
            this.updateList(targetDoc, targetDoc["viewfinder-left-indexed"], left);
        }
    }

    @action
    checkList = (doc: Doc, list: any): number => {
        const x: List<number> = list;
        if (x && x.length >= NumCast(doc.currentFrame) + 1) {
            return x[NumCast(doc.currentFrame)];
        } else {
            x.length = NumCast(doc.currentFrame) + 1;
            x[NumCast(doc.currentFrame)] = x[NumCast(doc.currentFrame) - 1];
            return x[NumCast(doc.currentFrame)];
        }

    }

    @action
    updateList = (doc: Doc, list: any, val: number) => {
        const x: List<number> = list;
        if (x && x.length >= NumCast(doc.currentFrame) + 1) {
            x[NumCast(doc.currentFrame)] = val;
            list = x;
        } else {
            x.length = NumCast(doc.currentFrame) + 1;
            x[NumCast(doc.currentFrame)] = val;
            list = x;
        }
    }

    // scale: NumCast(targetDoc._viewScale),
    @computed get zoomProgressivizeContainer() {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem?.presentationTargetDoc, Doc, null);
        if (targetDoc.editZoomProgressivize) {
            return (
                <>
                    <div id="resizable" className="resizable" onPointerDown={this.onPointerMid} style={{ width: this.checkList(targetDoc, targetDoc["viewfinder-width-indexed"]), height: this.checkList(targetDoc, targetDoc["viewfinder-height-indexed"]), top: this.checkList(targetDoc, targetDoc["viewfinder-top-indexed"]), left: this.checkList(targetDoc, targetDoc["viewfinder-left-indexed"]), position: 'absolute' }}>
                        <div className='resizers'>
                            <div id="resizer-tl" className='resizer top-left' onPointerDown={this.onPointerTL}></div>
                            <div id="resizer-tr" className='resizer top-right' onPointerDown={this.onPointerTR}></div>
                            <div id="resizer-bl" className='resizer bottom-left' onPointerDown={this.onPointerBL}></div>
                            <div id="resizer-br" className='resizer bottom-right' onPointerDown={this.onPointerBR}></div>
                        </div>
                    </div>
                </>
            );
        } else return null;
    }

    @computed get progressivizeChildDocs() {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem?.presentationTargetDoc, Doc, null);
        const docs = DocListCast(targetDoc[Doc.LayoutFieldKey(targetDoc)]);
        const tags: JSX.Element[] = [];
        docs.forEach((doc, index) => {
            if (doc["x-indexed"] && doc["y-indexed"]) {
                tags.push(<div style={{ position: 'absolute', display: doc.displayMovement ? "block" : "none" }}>{this.checkMovementLists(doc, doc["x-indexed"], doc["y-indexed"])}</div>);
            }
            tags.push(
                <div className="progressivizeButton" onPointerLeave={() => { if (NumCast(targetDoc.currentFrame) < NumCast(doc.appearFrame)) doc.opacity = 0; }} onPointerOver={() => { if (NumCast(targetDoc.currentFrame) < NumCast(doc.appearFrame)) doc.opacity = 0.5; }} onClick={e => { this.toggleDisplayMovement(doc); e.stopPropagation(); }} style={{ backgroundColor: doc.displayMovement ? "#aedff8" : "#c8c8c8", top: NumCast(doc.y), left: NumCast(doc.x) }}>
                    <div className="progressivizeButton-prev"><FontAwesomeIcon icon={"caret-left"} size={"lg"} onClick={e => { e.stopPropagation(); this.prevAppearFrame(doc, index); }} /></div>
                    <div className="progressivizeButton-frame">{doc.appearFrame}</div>
                    <div className="progressivizeButton-next"><FontAwesomeIcon icon={"caret-right"} size={"lg"} onClick={e => { e.stopPropagation(); this.nextAppearFrame(doc, index); }} /></div>
                </div>);
        });
        return tags;
    }

    @undoBatch
    @action
    nextAppearFrame = (doc: Doc, i: number): void => {
        console.log("next");
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem?.presentationTargetDoc, Doc, null);
        const appearFrame = Cast(doc.appearFrame, "number", null);
        if (appearFrame === undefined) {
            doc.appearFrame = 0;
        }
        doc.appearFrame = appearFrame + 1;
        const olist = new List<number>(numberRange(NumCast(targetDoc.lastFrame)).map(t => targetDoc.presProgressivize && t < (doc.appearFrame ? doc.appearFrame : i) ? 0 : 1));
        doc["opacity-indexed"] = olist;
        console.log(doc.appearFrame);
    }

    @undoBatch
    @action
    prevAppearFrame = (doc: Doc, i: number): void => {
        console.log("prev");
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem?.presentationTargetDoc, Doc, null);
        const appearFrame = Cast(doc.appearFrame, "number", null);
        if (appearFrame === undefined) {
            doc.appearFrame = 0;
        }
        doc.appearFrame = Math.max(0, appearFrame - 1);
        const olist = new List<number>(numberRange(NumCast(targetDoc.lastFrame)).map(t => targetDoc.presProgressivize && t < (doc.appearFrame ? doc.appearFrame : i) ? 0 : 1));
        doc["opacity-indexed"] = olist;
        console.log(doc.appearFrame);
    }

    @computed get moreInfoDropdown() {
        return (<div></div>);
    }

    @computed
    get toolbarWidth(): number {
        const width = this.props.PanelWidth();
        return width;
    }


    @computed get toolbar() {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        if (activeItem) {
            return (
                <>
                    <Tooltip title={<><div className="dash-tooltip">{"Add new slide"}</div></>}><div className={`toolbar-button ${this.newDocumentTools ? "active" : ""}`} onClick={this.toggleNewDocument}><FontAwesomeIcon icon={"plus"} />
                        <FontAwesomeIcon className={`dropdown ${this.newDocumentTools ? "active" : ""}`} icon={"angle-down"} />
                    </div></Tooltip>
                    <div className="toolbar-divider" />
                    <Tooltip title={<><div className="dash-tooltip">{"View paths"}</div></>}><div className={`toolbar-button ${this.pathBoolean ? "active" : ""}`}>
                        <FontAwesomeIcon icon={"exchange-alt"} onClick={this.viewPaths} />
                    </div></Tooltip>
                    <Tooltip title={<><div className="dash-tooltip">{this.expandBoolean ? "Minimize all" : "Expand all"}</div></>}>
                        <div className={`toolbar-button ${this.expandBoolean ? "active" : ""}`} onClick={() => { this.toggleExpand(); this.childDocs.forEach((doc, ind) => { if (this.expandBoolean) doc.presExpandInlineButton = true; else doc.presExpandInlineButton = false; }); }}>
                            <FontAwesomeIcon icon={"eye"} />
                        </div>
                    </Tooltip>
                    {/* <div className="toolbar-button"><FontAwesomeIcon title={"Portal"} icon={"eye"} onClick={this.toolbarTest} /></div> */}
                    <div className="toolbar-divider" />
                    <Tooltip title={<><div className="dash-tooltip">{"Transitions"}</div></>}><div className={`toolbar-button ${this.transitionTools ? "active" : ""}`} onClick={this.toggleTransitionTools}>
                        <FontAwesomeIcon icon={"rocket"} />
                        <div style={{ display: this.props.PanelWidth() > 430 ? "block" : "none" }} className="toolbar-buttonText">&nbsp; Transitions</div>
                        <FontAwesomeIcon className={`dropdown ${this.transitionTools ? "active" : ""}`} icon={"angle-down"} />
                    </div></Tooltip>
                    <div className="toolbar-divider" />
                    <Tooltip title={<><div className="dash-tooltip">{"Progressivize"}</div></>}><div className={`toolbar-button ${this.progressivizeTools ? "active" : ""}`} onClick={this.toggleProgressivize}>
                        <FontAwesomeIcon icon={"tasks"} />
                        <div style={{ display: this.props.PanelWidth() > 430 ? "block" : "none" }} className="toolbar-buttonText">&nbsp; Progressivize</div>
                        <FontAwesomeIcon className={`dropdown ${this.progressivizeTools ? "active" : ""}`} icon={"angle-down"} />
                    </div></Tooltip>
                    <div className="toolbar-divider" />
                    <div className="toolbar-button" style={{ position: 'absolute', right: 23, transform: 'rotate(45deg)', fontSize: 16 }}>
                        <FontAwesomeIcon className={"toolbar-thumbtack"} icon={"thumbtack"} />
                    </div>
                    <div className={`toolbar-button ${this.moreInfoTools ? "active" : ""}`} onClick={this.toggleMoreInfo}>
                        <div className={`toolbar-moreInfo ${this.moreInfoTools ? "active" : ""}`}>
                            <div className="toolbar-moreInfoBall" />
                            <div className="toolbar-moreInfoBall" />
                            <div className="toolbar-moreInfoBall" />
                        </div>
                    </div>
                </>
            );
        } else {
            return (
                <>
                    <Tooltip title={<><div className="dash-tooltip">{"Add new slide"}</div></>}><div className={`toolbar-button ${this.newDocumentTools ? "active" : ""}`} onClick={this.toggleNewDocument}><FontAwesomeIcon icon={"plus"} />
                        <FontAwesomeIcon className={`dropdown ${this.newDocumentTools ? "active" : ""}`} icon={"angle-down"} />
                    </div></Tooltip>
                    <div className="toolbar-button" style={{ position: 'absolute', right: 23, transform: 'rotate(45deg)', fontSize: 16 }}>
                        <FontAwesomeIcon className={"toolbar-thumbtack"} icon={"thumbtack"} />
                    </div>
                    <div className={`toolbar-button ${this.moreInfoTools ? "active" : ""}`} onClick={this.toggleMoreInfo}>
                        <div className={`toolbar-moreInfo ${this.moreInfoTools ? "active" : ""}`}>
                            <div className="toolbar-moreInfoBall" />
                            <div className="toolbar-moreInfoBall" />
                            <div className="toolbar-moreInfoBall" />
                        </div>
                    </div>
                </>
            );
        }
    }

    private _itemRef: React.RefObject<HTMLDivElement> = React.createRef();


    protected createPresDropTarget = (ele: HTMLDivElement) => {
        console.log("created?");
        this.treedropDisposer?.();
        ele && (this.treedropDisposer = DragManager.MakeDropTarget(ele, this.onInternalDrop.bind(this), this.layoutDoc, this.onInternalPreDrop.bind(this)));
        if (ele) {
            console.log("ele: " + ele.className)
        }
    }

    protected onInternalPreDrop(e: Event, de: DragManager.DropEvent, targetAction: dropActionType) {
        console.log("preDrop?")
        if (de.complete.docDragData) {
            // if targetDropAction is, say 'alias', but we're just dragging within a collection, we want to ignore the targetAction.
            // otherwise, the targetAction should become the actual action (which can still be overridden by the userDropAction -eg, shift/ctrl keys)
            if (targetAction && !de.complete.docDragData.draggedDocuments.some(d => d.context === this.props.Document && this.childDocs.includes(d))) {
                de.complete.docDragData.dropAction = targetAction;
            }
            e.stopPropagation();
        }
    }

    @action
    protected onInternalDrop(e: Event, de: DragManager.DropEvent): boolean {
        console.log("drop in pres")
        const docDragData = de.complete.docDragData;
        ScriptCast(this.props.Document.dropConverter)?.script.run({ dragData: docDragData });
        if (docDragData && this.props.addDocument) {
            console.log("docDragData && this.props.addDocument");
            let added = false;
            const dropaction = docDragData.dropAction || docDragData.userDropAction;
            if (dropaction && dropaction !== "move") {
                console.log("dropaction && dropaction !== move");
                added = this.props.addDocument(docDragData.droppedDocuments);
            } else if (docDragData.moveDocument) {
                console.log("docDragData.moveDocument");
                const movedDocs = docDragData.droppedDocuments.filter((d, i) => docDragData.draggedDocuments[i] === d);
                const addedDocs = docDragData.droppedDocuments.filter((d, i) => docDragData.draggedDocuments[i] !== d);
                const res = addedDocs.length ? this.props.addDocument(addedDocs) : true;
                if (movedDocs.length) {
                    const canAdd = this.props.Document._viewType === CollectionViewType.Pile || de.embedKey ||
                        Doc.AreProtosEqual(Cast(movedDocs[0].annotationOn, Doc, null), this.props.Document);
                    added = docDragData.moveDocument(movedDocs, this.props.Document, canAdd ? this.props.addDocument : returnFalse);
                } else added = res;
            } else {
                console.log("else");
                added = this.props.addDocument(docDragData.droppedDocuments);
            }
            added && e.stopPropagation();
            return added;
        }
        return false;
    }

    render() {
        this.childDocs.slice(); // needed to insure that the childDocs are loaded for looking up fields
        const mode = StrCast(this.rootDoc._viewType) as CollectionViewType;
        // const addDocument = (doc: Doc | Doc[], relativeTo?: Doc, before?: boolean) => {
        //     return add(doc, relativeTo ? relativeTo : docs[i], before !== undefined ? before : false);
        // };
        return <div onPointerOver={this.onPointerOver} onPointerLeave={this.onPointerLeave} className="presBox-cont" style={{ minWidth: this.layoutDoc.inOverlay ? 240 : undefined }} >
            <div className="presBox-buttons" style={{ display: this.rootDoc._chromeStatus === "disabled" ? "none" : undefined }}>
                <select className="presBox-viewPicker"
                    onPointerDown={e => e.stopPropagation()}
                    onChange={this.viewChanged}
                    value={mode}>
                    {/* <option onPointerDown={e => e.stopPropagation()} value={CollectionViewType.Invalid}>Min</option> */}
                    <option onPointerDown={e => e.stopPropagation()} value={CollectionViewType.Stacking}>List</option>
                    {/* <option onPointerDown={e => e.stopPropagation()} value={CollectionViewType.Time}>Time</option> */}
                    <option onPointerDown={e => e.stopPropagation()} value={CollectionViewType.Carousel}>Slides</option>
                </select>
                <div className="presBox-presentPanel">
                    <span className={`presBox-button ${this.layoutDoc.presStatus !== "edit" ? "active" : ""}`} title={"Reset Presentation" + this.layoutDoc.presStatus ? "" : " From Start"} style={{ minWidth: 60, gridColumn: 2 }}>
                        <div className="presBox-button-left" onClick={() => this.startOrResetPres(0)}>
                            <FontAwesomeIcon icon={"clock"} /> &nbsp;
                            <FontAwesomeIcon icon={this.layoutDoc.presStatus === "auto" ? "pause" : "play"} />
                        </div>
                        <div className={`presBox-button-right ${this.playTools ? "active" : ""}`} onClick={e => { e.stopPropagation; this.togglePlay(); }}>
                            <FontAwesomeIcon className="dropdown" style={{ margin: 0, transform: this.playTools ? 'rotate(180deg)' : 'rotate(0deg)' }} icon={"angle-down"} />
                            {this.playDropdown}
                        </div>
                    </span>
                    <span className={`presBox-button ${this.layoutDoc.presStatus === "edit" ? "present" : ""}`} title="Present">
                        <div className="presBox-button-left" onClick={() => this.layoutDoc.presStatus = "manual"}><FontAwesomeIcon icon={"play-circle"} /> &nbsp; Present </div>
                        <div className={`presBox-button-right ${this.presentTools ? "active" : ""}`} onClick={e => { e.stopPropagation; this.togglePresent(); }}>
                            <FontAwesomeIcon className="dropdown" style={{ margin: 0, transform: this.presentTools ? 'rotate(180deg)' : 'rotate(0deg)' }} icon={"angle-down"} />
                            {this.presentDropdown}
                        </div>
                    </span>
                    <div className={`presBox-button ${this.layoutDoc.presStatus !== "edit" ? "active" : ""}`} title="Back" onClick={this.back}>
                        <FontAwesomeIcon icon={"arrow-left"} />
                    </div>
                    <div className={`presBox-button ${this.layoutDoc.presStatus !== "edit" ? "active" : ""}`} title="Next" onClick={this.next}>
                        <FontAwesomeIcon icon={"arrow-right"} />
                    </div>
                    <div className={`presBox-button ${this.layoutDoc.presStatus !== "edit" ? "edit" : ""}`} title="Next" onClick={() => this.layoutDoc.presStatus = "edit"}>
                        <FontAwesomeIcon icon={"times"} />
                    </div>
                </div>
            </div>
            <div id="toolbarContainer" className={`presBox-toolbar ${this.layoutDoc.presStatus === "edit" ? "active" : ""}`}> {this.toolbar} </div>
            {this.newDocumentDropdown}
            {this.moreInfoDropdown}
            {this.transitionDropdown}
            {this.progressivizeDropdown}
            <div className="presBox-listCont"
                ref={this.createPresDropTarget}>
                {mode !== CollectionViewType.Invalid ?
                    <CollectionView {...this.props}
                        ContainingCollectionDoc={this.props.Document}
                        PanelWidth={this.props.PanelWidth}
                        PanelHeight={this.panelHeight}
                        moveDocument={returnFalse}
                        childOpacity={returnOne}
                        childLayoutTemplate={this.childLayoutTemplate}
                        filterAddDocument={this.addDocumentFilter}
                        removeDocument={returnFalse}
                        dontRegisterView={true}
                        focus={this.selectElement}
                        // presMultiSelect={this.multiSelect}
                        ScreenToLocalTransform={this.getTransform} />
                    : (null)
                }
            </div>
        </div>;
    }
}
Scripting.addGlobal(function lookupPresBoxField(container: Doc, field: string, data: Doc) {
    if (field === 'indexInPres') return DocListCast(container[StrCast(container.presentationFieldKey)]).indexOf(data);
    if (field === 'presCollapsedHeight') return container._viewType === CollectionViewType.Stacking ? 30 : 26;
    if (field === 'presStatus') return container.presStatus;
    if (field === '_itemIndex') return container._itemIndex;
    if (field === 'presBox') return container;
    return undefined;
});



// console.log("render = " + this.layoutDoc.title + " " + this.layoutDoc.presStatus);
// const presOrderedDocs = DocListCast(activeItem.presOrderedDocs);
// if (presOrderedDocs.length != this.childDocs.length || presOrderedDocs.some((pd, i) => pd !== this.childDocs[i])) {
//     this.rootDoc.presOrderedDocs = new List<Doc>(this.childDocs.slice());
// }


