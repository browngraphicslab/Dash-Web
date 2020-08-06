import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, DocCastAsync, WidthSym } from "../../../fields/Doc";
import { InkTool } from "../../../fields/InkField";
import { BoolCast, Cast, NumCast, StrCast, ScriptCast } from "../../../fields/Types";
import { returnFalse, returnOne, numberRange, returnTrue } from "../../../Utils";
import { documentSchema } from "../../../fields/documentSchemas";
import { DocumentManager } from "../../util/DocumentManager";
import { undoBatch } from "../../util/UndoManager";
import { CollectionDockingView, DockedFrameRenderer } from "../collections/CollectionDockingView";
import { CollectionView, CollectionViewType } from "../collections/CollectionView";
import { FieldView, FieldViewProps } from './FieldView';
import { DocumentType } from "../../documents/DocumentTypes";
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
import { actionAsync } from "mobx-utils";
import { SelectionManager } from "../../util/SelectionManager";
import { AudioBox } from "./AudioBox";

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

    @observable _moveOnFromAudio: boolean = false;

    @undoBatch
    @action
    next = () => {
        this.updateCurrentPresentation();
        const activeNext = Cast(this.childDocs[this.itemIndex + 1], Doc, null);
        const presTargetDoc = Cast(this.childDocs[this.itemIndex].presentationTargetDoc, Doc, null);
        const childDocs = DocListCast(presTargetDoc[Doc.LayoutFieldKey(presTargetDoc)]);
        const currentFrame = Cast(presTargetDoc.currentFrame, "number", null);
        const lastFrame = Cast(presTargetDoc.lastFrame, "number", null);
        const curFrame = NumCast(presTargetDoc.currentFrame);
        let internalFrames: boolean = false;
        if (presTargetDoc.presProgressivize || presTargetDoc.zoomProgressivize || presTargetDoc.scrollProgressivize) internalFrames = true;
        // Case 1: There are still other frames and should go through all frames before going to next slide
        if (internalFrames && lastFrame !== undefined && curFrame < lastFrame) {
            presTargetDoc._viewTransition = "all 1s";
            setTimeout(() => presTargetDoc._viewTransition = undefined, 1010);
            presTargetDoc.currentFrame = curFrame + 1;
            if (presTargetDoc.scrollProgressivize) CollectionFreeFormDocumentView.updateScrollframe(presTargetDoc, currentFrame);
            if (presTargetDoc.presProgressivize) CollectionFreeFormDocumentView.updateKeyframe(childDocs, currentFrame || 0);
            if (presTargetDoc.zoomProgressivize) this.zoomProgressivizeNext(presTargetDoc);
            // Case 2: Audio or video therefore wait to play the audio or video before moving on
        } else if ((presTargetDoc.type === DocumentType.VID || presTargetDoc.type === DocumentType.AUDIO) && !this._moveOnFromAudio) {
            if (presTargetDoc.type === DocumentType.AUDIO) {
                AudioBox.Instance.playFrom(0);
                this._moveOnFromAudio = true;
            }
            if (presTargetDoc.type === DocumentType.VID) {
                this._moveOnFromAudio = true;
            }
            // Case 3: No more frames in current doc and next slide is defined, therefore move to next slide
        } else if (activeNext !== undefined) {
            if (!presTargetDoc.presProgressivize) {
                const nextTagDoc = Cast(this.childDocs[this.itemIndex + 1].presentationTargetDoc, Doc, null);
                const nextChildDocs = DocListCast(nextTagDoc[Doc.LayoutFieldKey(presTargetDoc)]);
                nextChildDocs.forEach((doc, i) => {
                    doc.opacity = 1;
                });
            }
            const nextSelected = this.itemIndex + 1;
            this.gotoDocument(nextSelected, this.itemIndex);
            this._moveOnFromAudio = false;
        }
    }

    @undoBatch
    @action
    back = () => {
        this.updateCurrentPresentation();
        const docAtCurrent = this.childDocs[this.itemIndex];
        if (docAtCurrent) {
            let prevSelected = this.itemIndex;
            prevSelected = Math.max(0, prevSelected - 1);
            this.gotoDocument(prevSelected, this.itemIndex);
        }
    }

    zoomProgressivizeNext = (presTargetDoc: Doc) => {
        const srcContext = Cast(presTargetDoc.context, Doc, null);
        const docView = DocumentManager.Instance.getDocumentView(presTargetDoc);
        const vfLeft: number = this.checkList(presTargetDoc, presTargetDoc["viewfinder-left-indexed"]);
        const vfWidth: number = this.checkList(presTargetDoc, presTargetDoc["viewfinder-width-indexed"]);
        const vfTop: number = this.checkList(presTargetDoc, presTargetDoc["viewfinder-top-indexed"]);
        const vfHeight: number = this.checkList(presTargetDoc, presTargetDoc["viewfinder-height-indexed"]);
        // Case 1: document that is not a Golden Layout tab
        if (srcContext) {
            const srcDocView = DocumentManager.Instance.getDocumentView(srcContext);
            if (srcDocView) {
                const layoutdoc = Doc.Layout(presTargetDoc);
                const panelWidth: number = srcDocView.props.PanelWidth();
                const panelHeight: number = srcDocView.props.PanelHeight();
                const newPanX = NumCast(presTargetDoc.x) + NumCast(layoutdoc._width) / 2;
                const newPanY = NumCast(presTargetDoc.y) + NumCast(layoutdoc._height) / 2;
                const newScale = 0.9 * Math.min(Number(panelWidth) / vfWidth, Number(panelHeight) / vfHeight);
                srcContext._panX = newPanX + (vfLeft + (vfWidth / 2));
                srcContext._panY = newPanY + (vfTop + (vfHeight / 2));
                srcContext._viewScale = newScale;
            }
        }
        // Case 2: document is the containing collection
        if (docView && !srcContext) {
            const panelWidth: number = docView.props.PanelWidth();
            const panelHeight: number = docView.props.PanelHeight();
            const newScale = 0.9 * Math.min(Number(panelWidth) / vfWidth, Number(panelHeight) / vfHeight);
            presTargetDoc._panX = vfLeft + (vfWidth / 2);
            presTargetDoc._panY = vfTop + (vfWidth / 2);
            presTargetDoc._viewScale = newScale;
        }
        const resize = document.getElementById('resizable');
        if (resize) {
            resize.style.width = vfWidth + 'px';
            resize.style.height = vfHeight + 'px';
            resize.style.top = vfTop + 'px';
            resize.style.left = vfLeft + 'px';
        }
    }


    @action
    onHideDocument = () => {
        this.childDocs.forEach((doc, index) => {
            const curDoc = Cast(doc, Doc, null);
            const tagDoc = Cast(curDoc.presentationTargetDoc, Doc, null);
            if (tagDoc) tagDoc.opacity = 1;
            if (curDoc.presHideTillShownButton) {
                if (index > this.itemIndex) {
                    tagDoc.opacity = 0;
                } else if (!curDoc.presHideAfterButton) {
                    tagDoc.opacity = 1;
                }
            }
            if (curDoc.presHideAfterButton) {
                if (index < this.itemIndex) {
                    tagDoc.opacity = 0;
                } else if (!curDoc.presHideTillShownButton) {
                    tagDoc.opacity = 1;
                }
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
        const collectionDocView = presCollection ? await DocumentManager.Instance.getDocumentView(presCollection) : undefined;
        this.turnOffEdit();

        if (this.itemIndex >= 0) {
            if (targetDoc) {
                if (srcContext) this.layoutDoc.presCollection = srcContext;
            } else if (targetDoc) this.layoutDoc.presCollection = targetDoc;
        }
        if (collectionDocView) {
            if (srcContext && srcContext !== presCollection) {
                // Case 1: new srcContext inside of current collection so add a new tab to the current pres collection
                collectionDocView.props.addDocTab(srcContext, "inPlace");
            }
        }
        // else if (srcContext) {
        //     console.log("Case 2: srcContext - not open and collection containing this document exists, so open collection that contains it and then await zooming in on document");
        //     this.props.addDocTab(srcContext, "onRight");
        // } else if (!srcContext) {
        //     console.log("Case 3: !srcContext - no collection containing this document, therefore open document itself on right");
        //     this.props.addDocTab(targetDoc, "onRight");
        // }
        this.updateCurrentPresentation();
        const docToJump = curDoc;
        const willZoom = false;

        //docToJump stayed same meaning, it was not in the group or was the last element in the group
        if (targetDoc.zoomProgressivize && this.rootDoc.presStatus !== 'edit') {
            this.zoomProgressivizeNext(targetDoc);
        } else if (docToJump === curDoc) {
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
        if (activeItem.presPinView) {
            targetDoc._panX = activeItem.presPinViewX;
            targetDoc._panY = activeItem.presPinViewY;
            targetDoc._viewScale = activeItem.presPinViewScale;
        }
        if (collectionDocView && activeItem.openDocument) {
            collectionDocView.props.addDocTab(activeItem, "inPlace");
        }
        if (targetDoc.presWebsiteData) {
            targetDoc.data = targetDoc.presWebsiteData;
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
            this.onHideDocument();
            // this.onHideAfterPresClick();
        }
    });


    @observable _presTimer!: NodeJS.Timeout;

    //The function that starts or resets presentaton functionally, depending on status flag.
    @undoBatch
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
        });
    }

    updateMinimize = () => {
        const srcContext = Cast(this.rootDoc.presCollection, Doc, null);
        this.turnOffEdit();
        if (srcContext) {
            if (srcContext.miniPres) {
                document.removeEventListener("keydown", this.minimizeEvents, false);
                srcContext.miniPres = false;
                CollectionDockingView.AddRightSplit(this.rootDoc);
            } else {
                document.addEventListener("keydown", this.minimizeEvents, false);
                srcContext.miniPres = true;
                this.props.addDocTab?.(this.rootDoc, "close");
            }
        }
    }

    @undoBatch
    viewChanged = action((e: React.ChangeEvent) => {
        //@ts-ignore
        const viewType = e.target.selectedOptions[0].value as CollectionViewType;
        viewType === CollectionViewType.Stacking && (this.rootDoc._pivotField = undefined); // pivot field may be set by the user in timeline view (or some other way) -- need to reset it here
        this.rootDoc._viewType = viewType;
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
            if (activeItem.presSwitchButton) activeItem.presMovement = 'Jump cut';
            else activeItem.presMovement = 'None';
        } else {
            activeItem.presMovement = 'None';
            activeItem.presZoomButton = false;
            activeItem.presNavButton = false;
            activeItem.presSwitchButton = false;
        }
    });

    whenActiveChanged = action((isActive: boolean) => this.props.whenActiveChanged(this._isChildActive = isActive));
    // For dragging documents into the presentation trail
    addDocumentFilter = (doc: Doc | Doc[]) => {
        const docs = doc instanceof Doc ? [doc] : doc;
        docs.forEach((doc, i) => {
            if (this.childDocs.includes(doc)) {
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
    @observable _sortedSelectedArray: Doc[] = [];
    @observable _eleArray: HTMLElement[] = [];
    @observable _dragArray: HTMLElement[] = [];

    //TODO: Update to radix / quick sort
    @action
    sortArray = (): Doc[] => {
        const sort: Doc[] = this._selectedArray;
        this.childDocs.forEach((doc, i) => {
            if (this._selectedArray.includes(doc)) {
                sort.push(doc);
            }
        });
        return sort;
    }

    @computed get listOfSelected() {
        const list = this._selectedArray.map((doc: Doc, index: any) => {
            const activeItem = Cast(doc, Doc, null);
            const targetDoc = Cast(activeItem.presentationTargetDoc!, Doc, null);
            return (
                <div className="selectedList-items">{index + 1}.  {targetDoc.title}</div>
            );
        });
        return list;
    }

    //Regular click
    @action
    selectElement = (doc: Doc) => {
        this.gotoDocument(this.childDocs.indexOf(doc), NumCast(this.itemIndex));
    }

    //Command click
    @action
    multiSelect = (doc: Doc, ref: HTMLElement, drag: HTMLElement) => {
        this._selectedArray.push(this.childDocs[this.childDocs.indexOf(doc)]);
        this._eleArray.push(ref);
        this._dragArray.push(drag);
    }

    //Shift click
    @action
    shiftSelect = (doc: Doc, ref: HTMLElement, drag: HTMLElement) => {
        this._selectedArray = [];
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        if (activeItem) {
            for (let i = Math.min(this.itemIndex, this.childDocs.indexOf(doc)); i <= Math.max(this.itemIndex, this.childDocs.indexOf(doc)); i++) {
                this._selectedArray.push(this.childDocs[i]);
                this._eleArray.push(ref);
                this._dragArray.push(drag);
            }
        }
    }

    @action
    minimizeEvents = (e: KeyboardEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (e.keyCode === 27) { // Escape key
            this.layoutDoc.presStatus = "edit";
        } if (e.keyCode === 37) { // left(37) / a(65) / up(38) to go back
            this.back();
        } if (e.keyCode === 39) { // right (39) / d(68) / down(40) to go to next
            this.next();
        }
    }

    //Esc click
    @action
    keyEvents = (e: KeyboardEvent) => {
        e.stopPropagation();
        e.preventDefault();

        if (e.keyCode === 27) { // Escape key
            if (this.layoutDoc.presStatus === "edit") this._selectedArray = [];
            else this.layoutDoc.presStatus = "edit";
        } if ((e.metaKey || e.altKey) && e.keyCode === 65) { // Ctrl-A to select all
            if (this.layoutDoc.presStatus === "edit") this._selectedArray = this.childDocs;
        } if (e.keyCode === 37) { // left(37) / a(65) / up(38) to go back
            if (this.layoutDoc.presStatus !== "edit") this.back();
        } if (e.keyCode === 39) { // right (39) / d(68) / down(40) to go to next
            if (this.layoutDoc.presStatus !== "edit") this.next();
        } if (e.keyCode === 32) { // spacebar to 'present' or autoplay
            if (this.layoutDoc.presStatus !== "edit") this.startOrResetPres(0);
            else this.layoutDoc.presStatus = "manual";
        }
        if (e.keyCode === 8) { // delete selected items
            if (this.layoutDoc.presStatus === "edit") {
                this._selectedArray.forEach((doc, i) => {
                    this.removeDocument(doc);
                });
            }
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

    @undoBatch
    @action
    viewPaths = async () => {
        const srcContext = Cast(this.rootDoc.presCollection, Doc, null);
        if (this.pathBoolean) {
            if (srcContext) {
                this.togglePath();
                srcContext._fitToBox = false;
                srcContext._viewType = "freeform";
                srcContext.presPathView = false;
            }
        } else {
            if (srcContext) {
                this.togglePath();
                srcContext._fitToBox = true;
                srcContext._viewType = "freeform";
                srcContext.presPathView = true;
            }
        }
        const viewType = srcContext?._viewType;
        const fit = srcContext?._fitToBox;
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

    // WHAT IS THIS?
    @action
    dropdownToggle = (menu: string) => {
        const dropMenu = document.getElementById('presBox' + menu + 'Dropdown');
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
                                <div className={`presBox-dropdownOption ${activeItem.presMovement === 'Jump cut' ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.movementChanged('switch')}>Jump cut</div>
                            </div>
                        </div>
                        <div className="ribbon-doubleButton" style={{ display: activeItem.presMovement === 'Pan' || activeItem.presMovement === 'Zoom' ? "inline-flex" : "none" }}>
                            <div className="presBox-subheading" >Transition Speed</div>
                            <div className="ribbon-property"> {transitionSpeed} s </div>
                        </div>
                        <input type="range" step="0.1" min="0.1" max="10" value={transitionSpeed} className={`toolbar-slider ${activeItem.presMovement === 'Pan' || activeItem.presMovement === 'Zoom' ? "" : "none"}`} id="toolbar-slider" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { e.stopPropagation(); this.setTransitionTime(e.target.value); }} />
                        <div className={`slider-headers ${activeItem.presMovement === 'Pan' || activeItem.presMovement === 'Zoom' ? "" : "none"}`}>
                            <div className="slider-text">Fast</div>
                            <div className="slider-text">Medium</div>
                            <div className="slider-text">Slow</div>
                        </div>
                    </div>
                    <div className="ribbon-box">
                        Visibility {"&"} Duration
                        <div className="ribbon-doubleButton">
                            <Tooltip title={<><div className="dash-tooltip">{"Hide before presented"}</div></>}><div className={`ribbon-button ${activeItem.presHideTillShownButton ? "active" : ""}`} onClick={() => activeItem.presHideTillShownButton = !activeItem.presHideTillShownButton}>Hide before</div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Hide after presented"}</div></>}><div className={`ribbon-button ${activeItem.presHideAfterButton ? "active" : ""}`} onClick={() => activeItem.presHideAfterButton = !activeItem.presHideAfterButton}>Hide after</div></Tooltip>
                        </div>
                        <div className="ribbon-doubleButton" >
                            <div className="presBox-subheading">Slide Duration</div>
                            <div className="ribbon-property"> {duration} s </div>
                        </div>
                        <input type="range" step="0.1" min="0.1" max="10" value={duration} style={{ transform: 'rotate(0deg)' }} className={"toolbar-slider"} id="duration-slider" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { e.stopPropagation(); this.setDurationTime(e.target.value); }} />
                        <div className={"slider-headers"}>
                            <div className="slider-text">Short</div>
                            <div className="slider-text">Medium</div>
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
                        <div className="ribbon-doubleButton" style={{ display: effect === 'None' ? "none" : "inline-flex" }}>
                            <div className="presBox-subheading" >Effect direction</div>
                            <div className="ribbon-property">
                                {this.effectDirection}
                            </div>
                        </div>
                        <div className="effectDirection" style={{ display: effect === 'None' ? "none" : "grid", width: 40 }}>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from left"}</div></>}><div style={{ gridColumn: 1, gridRow: 2, justifySelf: 'center', color: targetDoc.presEffectDirection === "left" ? "#5a9edd" : "black" }} onClick={() => targetDoc.presEffectDirection = 'left'}><FontAwesomeIcon icon={"angle-right"} /></div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from right"}</div></>}><div style={{ gridColumn: 3, gridRow: 2, justifySelf: 'center', color: targetDoc.presEffectDirection === "right" ? "#5a9edd" : "black" }} onClick={() => targetDoc.presEffectDirection = 'right'}><FontAwesomeIcon icon={"angle-left"} /></div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from top"}</div></>}><div style={{ gridColumn: 2, gridRow: 1, justifySelf: 'center', color: targetDoc.presEffectDirection === "top" ? "#5a9edd" : "black" }} onClick={() => targetDoc.presEffectDirection = 'top'}><FontAwesomeIcon icon={"angle-down"} /></div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from bottom"}</div></>}><div style={{ gridColumn: 2, gridRow: 3, justifySelf: 'center', color: targetDoc.presEffectDirection === "bottom" ? "#5a9edd" : "black" }} onClick={() => targetDoc.presEffectDirection = 'bottom'}><FontAwesomeIcon icon={"angle-up"} /></div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from center"}</div></>}><div style={{ gridColumn: 2, gridRow: 2, width: 10, height: 10, alignSelf: 'center', justifySelf: 'center', border: targetDoc.presEffectDirection ? "solid 2px black" : "solid 2px #5a9edd", borderRadius: "100%" }} onClick={() => targetDoc.presEffectDirection = false}></div></Tooltip>
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

    @computed get effectDirection(): string {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem?.presentationTargetDoc, Doc, null);
        let effect = '';
        switch (targetDoc.presEffectDirection) {
            case 'left': effect = "Enter from left"; break;
            case 'right': effect = "Enter from right"; break;
            case 'top': effect = "Enter from top"; break;
            case 'bottom': effect = "Enter from bottom"; break;
            default: effect = "Enter from center"; break;
        }
        return effect;
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

    private inputRef = React.createRef<HTMLInputElement>();

    @computed get optionsDropdown() {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem?.presentationTargetDoc, Doc, null);
        if (activeItem && targetDoc) {
            return (
                <div>
                    <div className={'presBox-ribbon'} onClick={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                        <div className="ribbon-box">
                            <div className="ribbon-doubleButton" style={{ display: targetDoc.type === DocumentType.VID || targetDoc.type === DocumentType.AUDIO ? "inline-flex" : "none" }}>
                                <div className="ribbon-button" style={{ backgroundColor: activeItem.presProgressivize ? "#aedef8" : "" }} onClick={this.progressivizeChild}>Start automatically</div>
                                <div className="ribbon-button" style={{ display: "flex", backgroundColor: targetDoc.editProgressivize ? "#aedef8" : "" }} onClick={this.editProgressivize}>Start manually</div>
                            </div>
                            <div className="ribbon-doubleButton" style={{ display: "flex" }}>
                                <div className="ribbon-button" style={{ backgroundColor: activeItem.openDocument ? "#aedef8" : "" }} onClick={() => activeItem.openDocument = !activeItem.openDocument}>Open document</div>
                            </div>
                            <div className="ribbon-doubleButton" style={{ display: targetDoc.type === DocumentType.WEB ? "inline-flex" : "none" }}>
                                <div className="ribbon-button" onClick={this.progressivizeText}>Store original website</div>
                            </div>
                        </div>
                    </div>
                </div >
            );
        }
    }

    @computed get newDocumentToolbarDropdown() {
        return (
            <div>
                <div className={'presBox-toolbar-dropdown'} style={{ display: this.newDocumentTools && this.layoutDoc.presStatus === "edit" ? "inline-flex" : "none" }} onClick={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                    <div className="layout-container" style={{ height: 'max-content' }}>
                        <div className="layout" style={{ border: this.layout === 'blank' ? 'solid 2px #5b9ddd' : '' }} onClick={action(() => { this.layout = 'blank'; this.createNewSlide(this.layout); })} />
                        <div className="layout" style={{ border: this.layout === 'title' ? 'solid 2px #5b9ddd' : '' }} onClick={action(() => { this.layout = 'title'; this.createNewSlide(this.layout); })}>
                            <div className="title">Title</div>
                            <div className="subtitle">Subtitle</div>
                        </div>
                        <div className="layout" style={{ border: this.layout === 'header' ? 'solid 2px #5b9ddd' : '' }} onClick={action(() => { this.layout = 'header'; this.createNewSlide(this.layout); })}>
                            <div className="title" style={{ alignSelf: 'center', fontSize: 10 }}>Section header</div>
                        </div>
                        <div className="layout" style={{ border: this.layout === 'content' ? 'solid 2px #5b9ddd' : '' }} onClick={action(() => { this.layout = 'content'; this.createNewSlide(this.layout); })}>
                            <div className="title" style={{ alignSelf: 'center' }}>Title</div>
                            <div className="content">Text goes here</div>
                        </div>
                        {/* <div className="layout" style={{ border: this.layout === 'twoColumns' ? 'solid 2px #5b9ddd' : '' }} onClick={() => runInAction(() => { this.layout = 'twoColumns'; this.createNewSlide(this.layout); })}>
                            <div className="title" style={{ alignSelf: 'center', gridColumn: '1/3' }}>Title</div>
                            <div className="content" style={{ gridColumn: 1, gridRow: 2 }}>Column one text</div>
                            <div className="content" style={{ gridColumn: 2, gridRow: 2 }}>Column two text</div>
                        </div> */}
                    </div>
                </div>
            </div >
        );
    }

    @observable openLayouts: boolean = false;
    @observable addFreeform: boolean = true;
    @observable layout: string = "";
    @observable title: string = "";

    @computed get newDocumentDropdown() {
        return (
            <div>
                <div className={"presBox-ribbon"} onClick={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                    <div className="ribbon-box">
                        Slide Title: <br></br>
                        {/* <div className="dropdown-textInput"> */}
                        <input className="ribbon-textInput" placeholder="..." type="text" name="fname" ref={this.inputRef} onChange={(e) => {
                            e.stopPropagation();
                            runInAction(() => this.title = e.target.value);
                        }}></input>
                        {/* </div> */}
                    </div>
                    <div className="ribbon-box">
                        Choose type:
                        <div className="ribbon-doubleButton">
                            <div title="Text" className={'ribbon-button'} style={{ background: this.addFreeform ? "" : "#aedef8" }} onClick={action(() => this.addFreeform = !this.addFreeform)}>Text</div>
                            <div title="Freeform" className={'ribbon-button'} style={{ background: this.addFreeform ? "#aedef8" : "" }} onClick={action(() => this.addFreeform = !this.addFreeform)}>Freeform</div>
                        </div>
                    </div>
                    <div className="ribbon-box" style={{ display: this.addFreeform ? "grid" : "none" }}>
                        Preset layouts:
                        <div className="layout-container" style={{ height: this.openLayouts ? 'max-content' : '75px' }}>
                            <div className="layout" style={{ border: this.layout === 'blank' ? 'solid 2px #5b9ddd' : '' }} onClick={action(() => this.layout = 'blank')} />
                            <div className="layout" style={{ border: this.layout === 'title' ? 'solid 2px #5b9ddd' : '' }} onClick={action(() => this.layout = 'title')}>
                                <div className="title">Title</div>
                                <div className="subtitle">Subtitle</div>
                            </div>
                            <div className="layout" style={{ border: this.layout === 'header' ? 'solid 2px #5b9ddd' : '' }} onClick={action(() => this.layout = 'header')}>
                                <div className="title" style={{ alignSelf: 'center', fontSize: 10 }}>Section header</div>
                            </div>
                            <div className="layout" style={{ border: this.layout === 'content' ? 'solid 2px #5b9ddd' : '' }} onClick={action(() => this.layout = 'content')}>
                                <div className="title" style={{ alignSelf: 'center' }}>Title</div>
                                <div className="content">Text goes here</div>
                            </div>
                            <div className="layout" style={{ border: this.layout === 'twoColumns' ? 'solid 2px #5b9ddd' : '' }} onClick={action(() => this.layout = 'twoColumns')}>
                                <div className="title" style={{ alignSelf: 'center', gridColumn: '1/3' }}>Title</div>
                                <div className="content" style={{ gridColumn: 1, gridRow: 2 }}>Column one text</div>
                                <div className="content" style={{ gridColumn: 2, gridRow: 2 }}>Column two text</div>
                            </div>
                        </div>
                        <div className="open-layout" onClick={action(() => this.openLayouts = !this.openLayouts)}>
                            <FontAwesomeIcon style={{ transition: 'all 0.3s', transform: this.openLayouts ? 'rotate(180deg)' : 'rotate(0deg)' }} icon={"caret-down"} size={"lg"} />
                        </div>
                    </div>
                    <div className="ribbon-final-box">
                        <div className={this.title !== "" && (this.addFreeform && this.layout !== "" || !this.addFreeform) ? "ribbon-final-button-hidden" : "ribbon-final-button"} onClick={() => this.createNewSlide(this.layout, this.title, this.addFreeform)}>
                            Create New Slide
                        </div>
                    </div>
                </div>
            </div >
        );
    }

    createNewSlide = (layout?: string, title?: string, freeform?: boolean) => {
        let doc = undefined;
        if (layout) doc = this.createTemplate(layout);
        if (freeform && layout) doc = this.createTemplate(layout, title);
        if (!freeform && !layout) doc = Docs.Create.TextDocument("", { _nativeWidth: 400, _width: 225, title: title });
        const presCollection = Cast(this.layoutDoc.presCollection, Doc, null);
        const data = Cast(presCollection.data, listSpec(Doc));
        const presData = Cast(this.rootDoc.data, listSpec(Doc));
        if (data && doc && presData) {
            data.push(doc);
            DockedFrameRenderer.PinDoc(doc, false);
            this.gotoDocument(this.childDocs.length, this.itemIndex);
        }
    }

    createTemplate = (layout: string, input?: string) => {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem?.presentationTargetDoc, Doc, null);
        let x = 0;
        let y = 0;
        if (activeItem && targetDoc) {
            x = NumCast(targetDoc.x);
            y = NumCast(targetDoc.y) + NumCast(targetDoc._height) + 20;
        }
        let doc = undefined;
        const title = Docs.Create.TextDocument("Click to change title", { title: "Slide title", _width: 380, _height: 60, x: 10, y: 58, _fontSize: "24pt", });
        const subtitle = Docs.Create.TextDocument("Click to change subtitle", { title: "Slide subtitle", _width: 380, _height: 50, x: 10, y: 118, _fontSize: "16pt" });
        const header = Docs.Create.TextDocument("Click to change header", { title: "Slide header", _width: 380, _height: 65, x: 10, y: 80, _fontSize: "20pt" });
        const contentTitle = Docs.Create.TextDocument("Click to change title", { title: "Slide title", _width: 380, _height: 60, x: 10, y: 10, _fontSize: "24pt" });
        const content = Docs.Create.TextDocument("Click to change texte", { title: "Slide text", _width: 380, _height: 145, x: 10, y: 70, _fontSize: "14pt" });
        const content1 = Docs.Create.TextDocument("Click to change text", { title: "Column 1", _width: 185, _height: 140, x: 10, y: 80, _fontSize: "14pt" });
        const content2 = Docs.Create.TextDocument("Click to change text", { title: "Column 2", _width: 185, _height: 140, x: 205, y: 80, _fontSize: "14pt" });
        switch (layout) {
            case 'blank':
                doc = Docs.Create.FreeformDocument([], { title: input ? input : "Blank slide", _width: 400, _height: 225, x: x, y: y });
                break;
            case 'title':
                doc = Docs.Create.FreeformDocument([title, subtitle], { title: input ? input : "Title slide", _width: 400, _height: 225, _fitToBox: true, x: x, y: y });
                break;
            case 'header':
                doc = Docs.Create.FreeformDocument([header], { title: input ? input : "Section header", _width: 400, _height: 225, _fitToBox: true, x: x, y: y });
                break;
            case 'content':
                doc = Docs.Create.FreeformDocument([contentTitle, content], { title: input ? input : "Title and content", _width: 400, _height: 225, _fitToBox: true, x: x, y: y });
                break;
            case 'twoColumns':
                doc = Docs.Create.FreeformDocument([contentTitle, content1, content2], { title: input ? input : "Title and two columns", _width: 400, _height: 225, _fitToBox: true, x: x, y: y });
                break;
            default:
                break;
        }
        return doc;
    }

    // Dropdown that appears for autoplay
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

    // Dropdown that appears when the user wants to begin presenting (either minimize or sidebar view)
    @computed get presentDropdown() {
        return (
            <div className={`dropdown-play ${this.presentTools ? "active" : ""}`} onClick={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                <div className="dropdown-play-button" onClick={this.updateMinimize}>
                    Minimize
                </div>
                <div className="dropdown-play-button" onClick={() => { this.startOrResetPres(0); this.turnOffEdit(); }}>
                    Sidebar view
                </div>
            </div>
        );
    }

    // For toggling the options when the user wants to select play
    @action togglePlay = () => { this.playTools = !this.playTools; };

    // For toggling the options when the user wants to select play
    @action togglePresent = () => { this.presentTools = !this.presentTools; };

    // Case in which the document has keyframes to navigate to next key frame
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
        // let lastFrame: number = 0;
        // childDocs.forEach((doc) => {
        //     if (NumCast(doc.appearFrame) > lastFrame) lastFrame = NumCast(doc.appearFrame);
        // });
        CollectionFreeFormDocumentView.updateScrollframe(tagDoc, currentFrame);
        CollectionFreeFormDocumentView.updateKeyframe(childDocs, currentFrame || 0);
        tagDoc.currentFrame = Math.max(0, (currentFrame || 0) + 1);
        tagDoc.lastFrame = Math.max(NumCast(tagDoc.currentFrame), NumCast(tagDoc.lastFrame));
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

    @computed get stringType(): string {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem?.presentationTargetDoc, Doc, null);
        let type: string = '';
        if (activeItem) {
            switch (targetDoc.type) {
                case DocumentType.PDF: type = "PDF"; break;
                case DocumentType.RTF: type = "Text node"; break;
                case DocumentType.COL: type = "Collection"; break;
                case DocumentType.AUDIO: type = "Audio"; break;
                case DocumentType.VID: type = "Video"; break;
                case DocumentType.IMG: type = "Image"; break;
                default: type = "Other node"; break;
            }
        }
        return type;
    }

    @computed get progressivizeDropdown() {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem?.presentationTargetDoc, Doc, null);

        if (activeItem && targetDoc) {
            return (
                <div>
                    <div className={`presBox-ribbon ${this.progressivizeTools && this.layoutDoc.presStatus === "edit" ? "active" : ""}`} onClick={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                        <div className="ribbon-box">
                            {this.stringType} selected
                            <div className="ribbon-doubleButton" style={{ display: targetDoc.type === DocumentType.COL && targetDoc._viewType === 'freeform' ? "inline-flex" : "none" }}>
                                <div className="ribbon-button" style={{ backgroundColor: activeItem.presProgressivize ? "#aedef8" : "" }} onClick={this.progressivizeChild}>Child documents</div>
                                <div className="ribbon-button" style={{ display: activeItem.presProgressivize ? "flex" : "none", backgroundColor: targetDoc.editProgressivize ? "#aedef8" : "" }} onClick={this.editProgressivize}>Edit</div>
                            </div>
                            <div className="ribbon-doubleButton" style={{ display: (targetDoc.type === DocumentType.COL && targetDoc._viewType === 'freeform') || targetDoc.type === DocumentType.IMG ? "inline-flex" : "none" }}>
                                <div className="ribbon-button" style={{ backgroundColor: activeItem.zoomProgressivize ? "#aedef8" : "" }} onClick={this.progressivizeZoom}>Internal zoom</div>
                                <div className="ribbon-button" style={{ display: activeItem.zoomProgressivize ? "flex" : "none", backgroundColor: targetDoc.editZoomProgressivize ? "#aedef8" : "" }} onClick={this.editZoomProgressivize}>Viewfinder</div>
                                {/* <div className="ribbon-button" style={{ display: activeItem.zoomProgressivize ? "flex" : "none", backgroundColor: targetDoc.editSnapZoomProgressivize ? "#aedef8" : "" }} onClick={this.editSnapZoomProgressivize}>Snapshot</div> */}
                            </div>
                            {/* <div className="ribbon-doubleButton" style={{ display: targetDoc.type === DocumentType.COL && targetDoc._viewType === 'freeform' ? "inline-flex" : "none" }}>
                                <div className="ribbon-button" onClick={this.progressivizeText}>Text progressivize</div>
                                <div className="ribbon-button" style={{ display: activeItem.textProgressivize ? "flex" : "none", backgroundColor: targetDoc.editTextProgressivize ? "#aedef8" : "" }} onClick={this.editTextProgressivize}>Edit</div>
                            </div> */}
                            <div className="ribbon-doubleButton" style={{ display: targetDoc._viewType === "stacking" || targetDoc.type === DocumentType.PDF || targetDoc.type === DocumentType.WEB || targetDoc.type === DocumentType.RTF ? "inline-flex" : "none" }}>
                                <div className="ribbon-button" style={{ backgroundColor: activeItem.scrollProgressivize ? "#aedef8" : "" }} onClick={this.progressivizeScroll}>Scroll progressivize</div>
                                <div className="ribbon-button" style={{ display: activeItem.scrollProgressivize ? "flex" : "none", backgroundColor: targetDoc.editScrollProgressivize ? "#aedef8" : "" }} onClick={this.editScrollProgressivize}>Edit</div>
                            </div>
                        </div>
                        <div className="ribbon-final-box" style={{ display: activeItem.zoomProgressivize || activeItem.scrollProgressivize || activeItem.presProgressivize || activeItem.textProgressivize ? "grid" : "none" }}>
                            Frames
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
                                <Tooltip title={<><div className="dash-tooltip">{"Last frame"}</div></>}><div className="ribbon-property">{NumCast(targetDoc.lastFrame)}</div></Tooltip>
                            </div>
                            <div className="ribbon-button" style={{ height: 20, backgroundColor: "#5a9edd" }} onClick={() => console.log(" TODO: play frames")}>Play</div>
                        </div>
                    </div>
                </div>
            );
        }
    }

    turnOffEdit = () => {
        this.childDocs.forEach((doc, index) => {
            const targetDoc = Cast(doc.presentationTargetDoc, Doc, null);
            targetDoc.editSnapZoomProgressivize = false;
            targetDoc.editZoomProgressivize = false;
            targetDoc.editScrollProgressivize = false;
            if (doc.type === DocumentType.WEB) {
                doc.presWebsite = doc.data;
            }
        });
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
        if (activeItem.presProgressivize) {
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
        let pathPoints = ""; //List of all of the pathpoints that need to be added
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
            const scale2 = tagDocView.props.ScreenToLocalTransform().Scale;
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
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem?.presentationTargetDoc, Doc, null);
        const appearFrame = Cast(doc.appearFrame, "number", null);
        if (appearFrame === undefined) {
            doc.appearFrame = 0;
        }
        doc.appearFrame = appearFrame + 1;
        this.updateOpacityList(doc["opacity-indexed"], NumCast(doc.appearFrame));
    }

    @undoBatch
    @action
    prevAppearFrame = (doc: Doc, i: number): void => {
        const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        const targetDoc = Cast(activeItem?.presentationTargetDoc, Doc, null);
        const appearFrame = Cast(doc.appearFrame, "number", null);
        if (appearFrame === undefined) {
            doc.appearFrame = 0;
        }
        doc.appearFrame = Math.max(0, appearFrame - 1);
        this.updateOpacityList(doc["opacity-indexed"], NumCast(doc.appearFrame));
    }

    @action
    updateOpacityList = (list: any, frame: number) => {
        const x: List<number> = list;
        if (x && x.length >= frame) {
            for (let i = 0; i < x.length; i++) {
                if (i < frame) {
                    x[i] = 0;
                } else if (i >= frame) {
                    x[i] = 1;
                }
            }
            list = x;
        } else {
            x.length = frame + 1;
            for (let i = 0; i < x.length; i++) {
                if (i < frame) {
                    x[i] = 0;
                } else if (i >= frame) {
                    x[i] = 1;
                }
            }
            list = x;
        }
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
                    <Tooltip title={<><div className="dash-tooltip">{"Add new slide"}</div></>}><div className={`toolbar-button ${this.newDocumentTools ? "active" : ""}`} onClick={action(() => this.newDocumentTools = !this.newDocumentTools)}><FontAwesomeIcon icon={"plus"} />
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
                    {/* <Tooltip title={<><div className="dash-tooltip">{"Transitions"}</div></>}><div className={`toolbar-button ${this.transitionTools ? "active" : ""}`} onClick={this.toggleTransitionTools}>
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
                    <div className="toolbar-divider" /> */}
                    {/* <div className="toolbar-button" style={{ position: 'absolute', right: 23, transform: 'rotate(45deg)', fontSize: 16 }}>
                        <FontAwesomeIcon className={"toolbar-thumbtack"} icon={"thumbtack"} />
                    </div>
                    <div className={`toolbar-button ${this.moreInfoTools ? "active" : ""}`} onClick={this.toggleMoreInfo}>
                        <div className={`toolbar-moreInfo ${this.moreInfoTools ? "active" : ""}`}>
                            <div className="toolbar-moreInfoBall" />
                            <div className="toolbar-moreInfoBall" />
                            <div className="toolbar-moreInfoBall" />
                        </div>
                    </div> */}
                </>
            );
        } else {
            return (
                <>
                    <Tooltip title={<><div className="dash-tooltip">{"Add new slide"}</div></>}><div className={`toolbar-button ${this.newDocumentTools ? "active" : ""}`} onClick={action(() => this.newDocumentTools = !this.newDocumentTools)}>
                        <FontAwesomeIcon icon={"plus"} />
                        <FontAwesomeIcon className={`dropdown ${this.newDocumentTools ? "active" : ""}`} icon={"angle-down"} />
                    </div></Tooltip>
                    {/* <div className="toolbar-button" style={{ position: 'absolute', right: 23, transform: 'rotate(45deg)', fontSize: 16 }}>
                        <FontAwesomeIcon className={"toolbar-thumbtack"} icon={"thumbtack"} />
                    </div>
                    <div className={`toolbar-button ${this.moreInfoTools ? "active" : ""}`} onClick={this.toggleMoreInfo}>
                        <div className={`toolbar-moreInfo ${this.moreInfoTools ? "active" : ""}`}>
                            <div className="toolbar-moreInfoBall" />
                            <div className="toolbar-moreInfoBall" />
                            <div className="toolbar-moreInfoBall" />
                        </div>
                    </div> */}
                </>
            );
        }
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
                    style={{ display: this.layoutDoc.presStatus === "edit" ? "block" : "none" }}
                    onPointerDown={e => e.stopPropagation()}
                    onChange={this.viewChanged}
                    value={mode}>
                    <option onPointerDown={e => e.stopPropagation()} value={CollectionViewType.Stacking}>List</option>
                    <option onPointerDown={e => e.stopPropagation()} value={CollectionViewType.Carousel}>Slides</option>
                </select>
                <div className="presBox-presentPanel">
                    <span className={`presBox-button ${this.layoutDoc.presStatus === "edit" ? "present" : ""}`}>
                        <div className="presBox-button-left" onClick={() => this.layoutDoc.presStatus = "manual"}><FontAwesomeIcon icon={"play-circle"} /> <div style={{ display: this.props.PanelWidth() > 200 ? "inline-flex" : "none" }}>&nbsp; Present </div></div>
                        <div className={`presBox-button-right ${this.presentTools ? "active" : ""}`} onClick={e => { e.stopPropagation; this.togglePresent(); }}>
                            <FontAwesomeIcon className="dropdown" style={{ margin: 0, transform: this.presentTools ? 'rotate(180deg)' : 'rotate(0deg)' }} icon={"angle-down"} />
                            {this.presentDropdown}
                        </div>
                    </span>
                    <div className="miniPresOverlay" style={{ display: this.layoutDoc.presStatus !== "edit" ? "inline-flex" : "none" }}>
                        {/* <span className={`presBox-button ${this.layoutDoc.presStatus !== "edit" ? "active" : ""}`}>
                            <div className="presBox-button-left" onClick={() => this.startOrResetPres(0)}>
                                <FontAwesomeIcon icon={"clock"} /> &nbsp;
                                <FontAwesomeIcon icon={this.layoutDoc.presStatus === "auto" ? "pause" : "play"} />
                            </div>
                            <div className={`presBox-button-right ${this.playTools ? "active" : ""}`} onClick={e => { e.stopPropagation; this.togglePlay(); }}>
                                <FontAwesomeIcon className="dropdown" style={{ margin: 0, transform: this.playTools ? 'rotate(180deg)' : 'rotate(0deg)' }} icon={"angle-down"} />
                                {this.playDropdown}
                            </div>
                        </span> */}
                        <div className="miniPres-button" onClick={this.back}><FontAwesomeIcon icon={"arrow-left"} /></div>
                        <div className="miniPres-button" onClick={() => this.startOrResetPres(this.itemIndex)}><FontAwesomeIcon icon={PresBox.Instance.layoutDoc.presStatus === "auto" ? "pause" : "play"} /></div>
                        <div className="miniPres-button" onClick={this.next}><FontAwesomeIcon icon={"arrow-right"} /></div>
                        <div className="miniPres-divider"></div>
                        <div className="miniPres-button-text">Slide {this.itemIndex + 1} / {this.childDocs.length}</div>
                        <div className="miniPres-divider"></div>
                        <div className="miniPres-button" onClick={() => this.layoutDoc.presStatus = "edit"}>
                            <FontAwesomeIcon icon={"times"} />
                        </div>
                    </div>
                </div>
            </div>
            <div id="toolbarContainer" className={`presBox-toolbar ${this.layoutDoc.presStatus === "edit" ? "active" : ""}`}> {this.toolbar} </div>
            {this.newDocumentToolbarDropdown}
            <div className="presBox-listCont">
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