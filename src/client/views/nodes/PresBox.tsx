import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, DocCastAsync } from "../../../fields/Doc";
import { InkTool } from "../../../fields/InkField";
import { BoolCast, Cast, NumCast, StrCast } from "../../../fields/Types";
import { returnFalse, returnOne } from "../../../Utils";
import { documentSchema } from "../../../fields/documentSchemas";
import { DocumentManager } from "../../util/DocumentManager";
import { undoBatch } from "../../util/UndoManager";
import { CollectionDockingView, DockedFrameRenderer } from "../collections/CollectionDockingView";
import { CollectionView, CollectionViewType } from "../collections/CollectionView";
import { FieldView, FieldViewProps } from './FieldView';
import "./PresBox.scss";
import { ViewBoxBaseComponent } from "../DocComponent";
import { makeInterface, listSpec } from "../../../fields/Schema";
import { Docs } from "../../documents/Documents";
import { PrefetchProxy } from "../../../fields/Proxy";
import { ScriptField } from "../../../fields/ScriptField";
import { Scripting } from "../../util/Scripting";
import { InkingStroke } from "../InkingStroke";
import { HighlightSpanKind } from "typescript";
import { SearchUtil } from "../../util/SearchUtil";
import { CollectionFreeFormDocumentView } from "./CollectionFreeFormDocumentView";
import { child } from "serializr";
import { Zoom, Fade, Flip, Rotate, Bounce, Roll, LightSpeed } from 'react-reveal';


type PresBoxSchema = makeInterface<[typeof documentSchema]>;
const PresBoxDocument = makeInterface(documentSchema);

@observer
export class PresBox extends ViewBoxBaseComponent<FieldViewProps, PresBoxSchema>(PresBoxDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(PresBox, fieldKey); }
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
        document.addEventListener("keydown", this.keyEvents, false);
    }

    componentWillUnmount() {
        document.removeEventListener("keydown", this.keyEvents, false);
    }

    updateCurrentPresentation = () => Doc.UserDoc().activePresentation = this.rootDoc;

    @undoBatch
    @action
    next = () => {
        this.updateCurrentPresentation();
        const presTargetDoc = Cast(this.childDocs[this.itemIndex].presentationTargetDoc, Doc, null);
        const lastFrame = Cast(presTargetDoc.lastFrame, "number", null);
        const curFrame = NumCast(presTargetDoc.currentFrame);
        if (lastFrame !== undefined && curFrame < lastFrame) {
            presTargetDoc._viewTransition = "all 1s";
            setTimeout(() => presTargetDoc._viewTransition = undefined, 1010);
            presTargetDoc.currentFrame = curFrame + 1;
        }
        else if (this.childDocs[this.itemIndex + 1] !== undefined) {
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
     * the option open, navigates to that element.
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
    public gotoDocument = action((index: number, fromDoc: number) => {
        this.updateCurrentPresentation();
        Doc.UnBrushAllDocs();
        if (index >= 0 && index < this.childDocs.length) {
            this.rootDoc._itemIndex = index;
            const presTargetDoc = Cast(this.childDocs[this.itemIndex].presentationTargetDoc, Doc, null);
            if (presTargetDoc?.lastFrame !== undefined) {
                presTargetDoc.currentFrame = 0;
            }
            // if (this.layoutDoc.presStatus === "edit") {
            //     this.layoutDoc.presStatus = true;
            //     this.startPresentation(index);
            // }
            this.navigateToElement(this.childDocs[index], fromDoc);
            this.hideIfNotPresented(index);
            this.showAfterPresented(index);
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
        if (this._presTimer && this.layoutDoc.presStatus === "auto") {
            clearInterval(this._presTimer);
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
            // for (let i = this.itemIndex + 1; i <= this.childDocs.length; i++) {
            //     if (this.itemIndex + 1 === this.childDocs.length) {
            //         clearTimeout(this._presTimer);
            //         this.layoutDoc.presStatus = "manual";
            //     } else timer = setTimeout(() => { console.log(i); this.next(); }, i * 2000);
            // }

        }

        // if (this.layoutDoc.presStatus) {
        //     this.resetPresentation();
        // } else {
        //     this.layoutDoc.presStatus = true;
        //     this.startPresentation(0);
        //     this.gotoDocument(0, this.itemIndex);
        // }
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

    @undoBatch
    movementChanged = action((movement: string) => {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
        if (movement === 'zoom') {
            activeItem.presZoomButton = !activeItem.presZoomButton;
            activeItem.presNavButton = false;
        } else if (movement === 'nav') {
            activeItem.presZoomButton = false;
            activeItem.presNavButton = !activeItem.presNavButton;
        } else if (movement === 'swap') {
            targetDoc.presTransition = 0;
        } else {
            activeItem.presZoomButton = false;
            activeItem.presNavButton = false;
        }
    });

    @undoBatch
    visibilityChanged = action((visibility: string) => {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        if (visibility === 'fade') {
            activeItem.presFadeButton = !activeItem.presFadeButton;
        } else if (visibility === 'hideBefore') {
            activeItem.presHideTillShownButton = !activeItem.presHideTillShownButton;
            activeItem.presHideAfterButton = false;
        } else if (visibility === 'hideAfter') {
            activeItem.presHideAfterButton = !activeItem.presHideAfterButton;
            activeItem.presHideAfterButton = false;
        } else {
            activeItem.presHideAfterButton = false;
            activeItem.presHideTillShownButton = false;
            activeItem.presFadeButton = false;
        }
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
    getTransform = () => this.props.ScreenToLocalTransform().translate(-5, -65);// listBox padding-left and pres-box-cont minHeight
    panelHeight = () => this.props.PanelHeight() - 20;
    active = (outsideReaction?: boolean) => ((Doc.GetSelectedTool() === InkTool.None && !this.layoutDoc.isBackground) &&
        (this.layoutDoc.forceActive || this.props.isSelected(outsideReaction) || this._isChildActive || this.props.renderDepth === 0) ? true : false)


    // KEYS
    @observable _selectedArray: Doc[] = [];

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
        this._selectedArray = [];
        this.gotoDocument(this.childDocs.indexOf(doc), NumCast(this.itemIndex));
        this._selectedArray.push(this.childDocs[this.childDocs.indexOf(doc)]);
        console.log(this._selectedArray);
    }

    //Command click
    @action
    multiSelect = (doc: Doc) => {
        this._selectedArray.push(this.childDocs[this.childDocs.indexOf(doc)]);
        console.log(this._selectedArray);
    }

    //Shift click
    @action
    shiftSelect = (doc: Doc) => {
        this._selectedArray = [];
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        if (activeItem) {
            for (let i = Math.min(this.itemIndex, this.childDocs.indexOf(doc)); i <= Math.max(this.itemIndex, this.childDocs.indexOf(doc)); i++) {
                this._selectedArray.push(this.childDocs[i]);
            }
        }
        console.log(this._selectedArray);
    }



    //Esc click
    @action
    keyEvents = (e: KeyboardEvent) => {
        e.stopPropagation;
        // switch(e.keyCode) {
        //     case 27: console.log("escape");
        //     case 65 && (e.metaKey || e.altKey): 
        // }
        // Escape key
        if (e.keyCode === 27) {
            if (this.layoutDoc.presStatus === "edit") this._selectedArray = [];
            else this.layoutDoc.presStatus = "edit";
            // Ctrl-A to select all
        } else if ((e.metaKey || e.altKey) && e.keyCode === 65) {
            if (this.layoutDoc.presStatus === "edit") this._selectedArray = this.childDocs;
            // left / a / up to go back
        } else if (e.keyCode === 37 || 65 || 38) {
            if (this.layoutDoc.presStatus !== "edit") this.back();
            // right / d / down to go to next
        } else if (e.keyCode === 39 || 68 || 40) {
            if (this.layoutDoc.presStatus !== "edit") this.next();
            // spacebar to 'present' or go to next slide
        } else if (e.keyCode === 32) {
            if (this.layoutDoc.presStatus !== "edit") this.next();
            else this.layoutDoc.presStatus = "manual";
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


    @observable private transitionTools: boolean = false;
    @observable private newDocumentTools: boolean = false;
    @observable private progressivizeTools: boolean = false;
    @observable private moreInfoTools: boolean = false;
    @observable private playTools: boolean = false;
    @observable private pathBoolean: boolean = false;

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

    @action toggleAllDropdowns() {
        this.transitionTools = false;
        this.newDocumentTools = false;
        this.progressivizeTools = false;
        this.moreInfoTools = false;
        this.playTools = false;
    }

    @undoBatch
    @action
    toolbarTest = () => {
        const presTargetDoc = Cast(this.childDocs[this.itemIndex].presentationTargetDoc, Doc, null);
        console.log("title: " + presTargetDoc.title);
        console.log("index: " + this.itemIndex);
    }

    @undoBatch
    @action
    viewPaths = async () => {
        const docToJump = this.childDocs[0];
        const aliasOf = await DocCastAsync(docToJump.aliasOf);
        const srcContext = aliasOf && await DocCastAsync(aliasOf.context);
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

    @computed get paths() {
        const paths = []; //List of all of the paths that need to be added
        console.log(this.childDocs.length - 1);
        for (let i = 0; i <= this.childDocs.length - 1; i++) {
            const targetDoc = Cast(this.childDocs[i].presentationTargetDoc, Doc, null);
            if (this.childDocs[i + 1] && targetDoc) {
                const nextTargetDoc = Cast(this.childDocs[i + 1].presentationTargetDoc, Doc, null);
                const n1x = NumCast(targetDoc.x) + (NumCast(targetDoc._width) / 2);
                const n1y = NumCast(targetDoc.y) + (NumCast(targetDoc._height) / 2);
                const n2x = NumCast(nextTargetDoc.x) + (NumCast(targetDoc._width) / 2);
                const n2y = NumCast(nextTargetDoc.y) + (NumCast(targetDoc._height) / 2);
                const pathPoints = n1x + "," + n1y + " " + n2x + "," + n2y;
                paths.push(<polyline
                    points={pathPoints}
                    style={{
                        opacity: 0.7,
                        stroke: "#69a6db",
                        strokeWidth: 5,
                    }}
                    markerStart="url(#square)"
                    markerEnd="url(#arrow)" />);
            }
        }
        return paths;
    }

    @action togglePath = () => this.pathBoolean = !this.pathBoolean;

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

        if (activeItem) {
            const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
            const transitionSpeed = targetDoc.presTransition ? String(Number(targetDoc.presTransition) / 1000) : 0.5;
            const duration = targetDoc.presDuration ? String(Number(targetDoc.presDuration) / 1000) : 2;
            const transitionThumbLocation = String(-9.48 * Number(transitionSpeed) + 93);
            const durationThumbLocation = String(9.48 * Number(duration));
            const movement = activeItem.presZoomButton ? 'Zoom' : activeItem.presNavbutton ? 'Navigate' : 'None';
            const effect = targetDoc.presEffect ? targetDoc.presEffect : 'None';
            const visibility = activeItem.presFadeButton ? 'Fade' : activeItem.presHideTillShownButton ? 'Hide till shown' : activeItem.presHideAfter ? 'Hide on exit' : 'None';
            return (
                <div className={`presBox-ribbon ${this.transitionTools && this.layoutDoc.presStatus === "edit" ? "active" : ""}`} onClick={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                    <div className="ribbon-box">
                        Movement
                        <div className="presBox-dropdown"
                            onPointerDown={e => e.stopPropagation()}
                        // onClick={() => this.dropdownToggle('Movement')}
                        >
                            {movement}
                            <FontAwesomeIcon className='presBox-dropdownIcon' style={{ gridColumn: 2 }} icon={"angle-down"} />
                            <div className={'presBox-dropdownOptions'} id={'presBoxMovementDropdown'} onClick={e => e.stopPropagation()}>
                                <div className={`presBox-dropdownOption ${!activeItem.presZoomButton && !activeItem.presNavButton ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.movementChanged('none')}>None</div>
                                <div className={`presBox-dropdownOption ${activeItem.presZoomButton ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.movementChanged('zoom')}>Pan and Zoom</div>
                                <div className={`presBox-dropdownOption ${activeItem.presNavButton ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.movementChanged('nav')}>Pan</div>
                                <div className={`presBox-dropdownOption ${activeItem.presNavButton ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.movementChanged('swap')}>Swap</div>
                            </div>
                        </div>
                        <input type="range" step="0.1" min="0.1" max="10" value={transitionSpeed} className={`toolbar-slider ${activeItem.presZoomButton || activeItem.presNavButton ? "" : "none"}`} id="toolbar-slider" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { e.stopPropagation(); this.setTransitionTime(e.target.value); }} />
                        <div className={`slider-headers ${activeItem.presZoomButton || activeItem.presNavButton ? "" : "none"}`}>
                            <div className={`slider-value ${activeItem.presZoomButton || activeItem.presNavButton ? "" : "none"}`} style={{ left: transitionThumbLocation + '%' }}>{transitionSpeed}s</div>
                            <div className="slider-text">Slow</div>
                            <div className="slider-text">Medium</div>
                            <div className="slider-text">Fast</div>
                        </div>
                    </div>
                    <div className="ribbon-box">
                        Duration
                        <div className="presBox-dropdown"
                            onPointerDown={e => e.stopPropagation()}
                        >
                            {duration} seconds
                        </div>
                        <input type="range" step="0.1" min="0.1" max="10" value={duration} style={{ transform: 'rotate(0deg)' }} className={"toolbar-slider"} id="duration-slider" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { e.stopPropagation(); this.setDurationTime(e.target.value); }} />
                        <div className={"slider-headers"}>
                            <div className={"slider-value"} style={{ left: durationThumbLocation + '%' }}>{duration}s</div>
                            <div className="slider-text">Short</div>
                            <div className="slider-text"></div>
                            <div className="slider-text">Long</div>
                        </div>
                        {/* <div title="Fade After" className={`ribbon-button ${activeItem.presFadeButton ? "active" : ""}`} onClick={this.onFadeDocumentAfterPresentedClick}>Fade After</div> */}
                        {/* <div title="Hide After" className={`ribbon-button ${activeItem.presHideTillShownButton ? "active" : ""}`} onClick={() => console.log("hide before")}>Hide Before</div> */}
                        {/* <div title="Hide Before" className={`ribbon-button ${activeItem.presHideAfterButton ? "active" : ""}`} onClick={() => console.log("hide after")}>Hide After</div> */}
                    </div>
                    <div className="ribbon-box">
                        Effects
                        <div className="presBox-dropdown"
                            onPointerDown={e => e.stopPropagation()}
                        // onClick={() => this.dropdownToggle('Movement')}
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
                        <div className="effectDirection">
                            <div style={{ gridColumn: 1, gridRow: 2, justifySelf: 'center', color: targetDoc.presEffectDirection === "left" ? "#5a9edd" : "black" }} onClick={() => targetDoc.presEffectDirection = 'left'}><FontAwesomeIcon icon={"angle-right"} /></div>
                            <div style={{ gridColumn: 3, gridRow: 2, justifySelf: 'center', color: targetDoc.presEffectDirection === "right" ? "#5a9edd" : "black" }} onClick={() => targetDoc.presEffectDirection = 'right'}><FontAwesomeIcon icon={"angle-left"} /></div>
                            <div style={{ gridColumn: 2, gridRow: 1, justifySelf: 'center', color: targetDoc.presEffectDirection === "top" ? "#5a9edd" : "black" }} onClick={() => targetDoc.presEffectDirection = 'top'}><FontAwesomeIcon icon={"angle-down"} /></div>
                            <div style={{ gridColumn: 2, gridRow: 3, justifySelf: 'center', color: targetDoc.presEffectDirection === "bottom" ? "#5a9edd" : "black" }} onClick={() => targetDoc.presEffectDirection = 'bottom'}><FontAwesomeIcon icon={"angle-up"} /></div>
                            <div style={{ gridColumn: 2, gridRow: 2, width: 10, height: 10, alignSelf: 'center', justifySelf: 'center', border: targetDoc.presEffectDirection ? "solid 2px black" : "solid 2px #5a9edd", borderRadius: "100%" }} onClick={() => targetDoc.presEffectDirection = false}></div>
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
                        <div style={{ display: "flex", alignSelf: "center" }}>
                            <div title="Text" className={`ribbon-button ${type === "text" ? "active" : ""}`} onClick={() => { type = "text"; }}>Text</div>
                            <div title="Freeform" className={`ribbon-button ${type === "freeform" ? "active" : ""}`} onClick={() => { type = "freeform"; }}>Freeform</div>
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
                    Start from current slide
                </div>
                <div className="dropdown-play-button" onClick={() => this.startOrResetPres(0)}>
                    Start from first slide
                </div>
            </div>
        );
    }

    progressivizeOptions = (viewType: string) => {
        const buttons = [];
        buttons.push(<div className="ribbon-button" title="Progressivize child documents" onClick={this.progressivize}>Progressivize child documents</div>);
        buttons.push(<div className="ribbon-button" title="Internal navigation" onClick={() => console.log("hide after")}>Internal navigation</div>);
        if (viewType === "rtf") {
            buttons.push(<div className="ribbon-button" title="Progressivize bullet points" onClick={() => console.log("hide after")}>Bullet points</div>);
        }
        return buttons;
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
                            <div className="selectedList">
                                <div className="selectedList-items">1. {targetDoc.title}</div>
                            </div>
                        </div>
                        <div className="ribbon-final-box">
                            <div className="progressivizeEdit">
                                <div className="ribbon-button" style={{ backgroundColor: activeItem.presProgressivize ? "#aedef8" : "" }} title="Progressivize child documents" onClick={this.progressivize}>Progressivize child documents</div>
                                <div className="ribbon-button" style={{ display: activeItem.presProgressivize ? "block" : "none", backgroundColor: targetDoc.editProgressivize ? "#aedef8" : "" }} title="Edit progresivize" onClick={this.editProgressivize}>Edit</div>
                            </div>
                            <div className="ribbon-button" title="Internal navigation" onClick={() => console.log("hide after")}>Internal navigation</div>
                        </div>
                    </div>
                </div>
            );
        }
    }

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
    progressivize = (e: React.MouseEvent) => {
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

    @computed get progressivizeChildDocs() {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem?.presentationTargetDoc, Doc, null);
        const docs = DocListCast(targetDoc[Doc.LayoutFieldKey(targetDoc)]);
        const tags: JSX.Element[] = [];
        docs.forEach((doc, index) => {
            tags.push(
                <div className="progressivizeButton" style={{ top: NumCast(doc.y), left: NumCast(doc.x) }}>{doc.appearFrame}</div>
            );
        });
        return tags;
    }



    @computed get moreInfoDropdown() {
        return (<div></div>);
    }

    @computed get effectOpenBracket() {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
        if (targetDoc.presEffect && this.itemIndex) {
            return ("<" + targetDoc.presEffect + "when=" + this.layoutDoc === PresBox.Instance.childDocs[this.itemIndex].presentationTargetDoc + ">");
        } else return;
    }

    @computed get effectCloseBracket() {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
        if (targetDoc.presEffect && this.itemIndex) {
            return ("</" + targetDoc.presEffect + ">");
        } else return;
    }

    @computed get toolbar() {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);

        if (activeItem) {
            return (
                <>
                    <div className={`toolbar-button ${this.newDocumentTools ? "active" : ""}`} onClick={this.toggleNewDocument}><FontAwesomeIcon icon={"plus"} />
                        <FontAwesomeIcon className={`dropdown ${this.newDocumentTools ? "active" : ""}`} icon={"angle-down"} />
                    </div>
                    <div className="toolbar-divider" />
                    <div className={`toolbar-button ${this.pathBoolean ? "active" : ""}`}><FontAwesomeIcon title={"View Paths"} icon={"object-group"} onClick={this.viewPaths} /></div>
                    {/* <div className="toolbar-button"><FontAwesomeIcon title={"Portal"} icon={"eye"} onClick={this.toolbarTest} /></div> */}
                    <div className="toolbar-divider" />
                    <div className={`toolbar-button ${this.transitionTools ? "active" : ""}`} onClick={this.toggleTransitionTools}>
                        <FontAwesomeIcon icon={"rocket"} />
                        <div className="toolbar-buttonText">&nbsp; Transitions</div>
                        <FontAwesomeIcon className={`dropdown ${this.transitionTools ? "active" : ""}`} icon={"angle-down"} />
                    </div>
                    <div className="toolbar-divider" />
                    <div className={`toolbar-button ${this.progressivizeTools ? "active" : ""}`} onClick={this.toggleProgressivize}>
                        <FontAwesomeIcon icon={"tasks"} />
                        <div className="toolbar-buttonText">&nbsp; Progressivize</div>
                        <FontAwesomeIcon className={`dropdown ${this.progressivizeTools ? "active" : ""}`} icon={"angle-down"} />
                    </div>
                    <div className="toolbar-divider" />
                    <div className="toolbar-button">
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
                    <div className="toolbar-button"><FontAwesomeIcon icon={"plus"} onClick={this.toggleNewDocument} />
                        <FontAwesomeIcon className={`dropdown ${this.newDocumentTools ? "active" : ""}`} icon={"angle-down"} />
                    </div>
                    <div className="toolbar-button">
                        <FontAwesomeIcon className={"toolbar-thumbtack"} icon={"thumbtack"} />
                    </div>
                    <Fade left when={this.moreInfoTools}>
                        <h1>uppercase</h1>
                    </Fade>
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

    render() {
        this.childDocs.slice(); // needed to insure that the childDocs are loaded for looking up fields 
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
                <div className="presBox-presentPanel">
                    <div className={`presBox-button ${this.layoutDoc.presStatus !== "edit" ? "active" : ""}`} title={"Reset Presentation" + this.layoutDoc.presStatus ? "" : " From Start"} style={{ gridColumn: 2 }} onClick={() => this.startOrResetPres(0)}>
                        <FontAwesomeIcon icon={"clock"} /> &nbsp;
                        <FontAwesomeIcon icon={this.layoutDoc.presStatus === "auto" ? "pause" : "play"} />
                        <div className="toolbar-divider" style={{ marginLeft: 5 }} />
                        <FontAwesomeIcon onClick={e => { e.stopPropagation; this.togglePlay(); }} className="dropdown" icon={"angle-down"} />
                        {this.playDropdown}
                    </div>
                    <div className={`presBox-button ${this.layoutDoc.presStatus === "edit" ? "present" : ""}`} title="Present" onClick={() => this.layoutDoc.presStatus = "manual"}>
                        <FontAwesomeIcon className="present-icon" icon={"play-circle"} /> Present
                    </div>
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
            <div className={`presBox-toolbar ${this.layoutDoc.presStatus === "edit" ? "active" : ""}`}> {this.toolbar} </div>
            {this.newDocumentDropdown}
            {this.moreInfoDropdown}
            {this.transitionDropdown}
            {this.progressivizeDropdown}
            <div className="presBox-listCont" >
                {mode !== CollectionViewType.Invalid ?
                    <CollectionView {...this.props}
                        ContainingCollectionDoc={this.props.Document}
                        PanelWidth={this.props.PanelWidth}
                        PanelHeight={this.panelHeight}
                        moveDocument={returnFalse}
                        childOpacity={returnOne}
                        childLayoutTemplate={this.childLayoutTemplate}
                        filterAddDocument={returnFalse}
                        removeDocument={returnFalse}
                        dontRegisterView={true}
                        focus={this.selectElement}
                        presMultiSelect={this.multiSelect}
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
    if (field === 'presBox') return container;
    return undefined;
});



        // console.log("render = " + this.layoutDoc.title + " " + this.layoutDoc.presStatus);
        // const presOrderedDocs = DocListCast(activeItem.presOrderedDocs);
        // if (presOrderedDocs.length != this.childDocs.length || presOrderedDocs.some((pd, i) => pd !== this.childDocs[i])) {
        //     this.rootDoc.presOrderedDocs = new List<Doc>(this.childDocs.slice());
        // }