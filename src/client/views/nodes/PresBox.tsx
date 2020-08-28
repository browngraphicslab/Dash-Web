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
import { CollectionFreeFormDocumentView } from "./CollectionFreeFormDocumentView";
import { List } from "../../../fields/List";
import { Tooltip } from "@material-ui/core";
import { actionAsync } from "mobx-utils";
import { SelectionManager } from "../../util/SelectionManager";
import { AudioBox } from "./AudioBox";
import { DocumentView } from "./DocumentView";
import { SketchPicker, ColorState } from "react-color";
import { CurrentUserUtils } from "../../util/CurrentUserUtils";

type PresBoxSchema = makeInterface<[typeof documentSchema]>;
const PresBoxDocument = makeInterface(documentSchema);

@observer
export class PresBox extends ViewBoxBaseComponent<FieldViewProps, PresBoxSchema>(PresBoxDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(PresBox, fieldKey); }

    public static Instance: PresBox;

    @observable _isChildActive = false;
    @observable _moveOnFromAudio: boolean = true;
    @observable _presTimer!: NodeJS.Timeout;

    @observable _selectedArray: Doc[] = [];
    @observable _sortedSelectedArray: Doc[] = [];
    @observable _eleArray: HTMLElement[] = [];
    @observable _dragArray: HTMLElement[] = [];

    @observable private transitionTools: boolean = false;
    @observable private newDocumentTools: boolean = false;
    @observable private progressivizeTools: boolean = false;
    @observable private moreInfoTools: boolean = false;
    @observable private playTools: boolean = false;
    @observable private presentTools: boolean = false;
    @observable private pathBoolean: boolean = false;
    @observable private expandBoolean: boolean = false;
    @observable private openMovementDropdown: boolean = false;
    @observable private openEffectDropdown: boolean = false;
    @computed get childDocs() { return DocListCast(this.dataDoc[this.fieldKey]); }
    @computed get itemIndex() { return NumCast(this.rootDoc._itemIndex); }
    @computed get activeItem() { return Cast(this.childDocs[this.itemIndex], Doc, null); }
    @computed get targetDoc() { return Cast(this.activeItem?.presentationTargetDoc, Doc, null); }
    @computed get presElement() { return Cast(Doc.UserDoc().presElement, Doc, null); }
    constructor(props: any) {
        super(props);
        if (Doc.UserDoc().activePresentation = this.rootDoc) PresBox.Instance = this;
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
    @computed get selectedDocumentView() {
        if (SelectionManager.SelectedDocuments().length) {
            return SelectionManager.SelectedDocuments()[0];
        } else if (PresBox.Instance._selectedArray.length) {
            return DocumentManager.Instance.getDocumentView(PresBox.Instance.rootDoc);
        } else { return undefined; }
    }
    @computed get isPres(): boolean {
        document.removeEventListener("keydown", this.keyEvents, true);
        if (this.selectedDoc?.type === DocumentType.PRES) {
            document.addEventListener("keydown", this.keyEvents, true);
            return true;
        }
        return false;
    }
    @computed get selectedDoc() { return this.selectedDocumentView?.rootDoc; }

    componentWillUnmount() {
        document.removeEventListener("keydown", this.keyEvents, true);
        this.turnOffEdit();
    }

    componentDidMount() {
        this.rootDoc.presBox = this.rootDoc;
        this.rootDoc._forceRenderEngine = "timeline";
        this.rootDoc._replacedChrome = "replaced";
        this.layoutDoc.presStatus = "edit";
        this.layoutDoc._gridGap = 5;
        if (!DocListCast((Doc.UserDoc().myPresentations as Doc).data).includes(this.rootDoc)) {
            Doc.AddDocToList(Doc.UserDoc().myPresentations as Doc, "data", this.rootDoc);
        }
    }

    updateCurrentPresentation = () => {
        Doc.UserDoc().activePresentation = this.rootDoc;
        PresBox.Instance = this;
    }

    /**
     * Called when the user moves to the next slide in the presentation trail.
     */
    @undoBatch
    @action
    next = () => {
        this.updateCurrentPresentation();
        const activeNext = Cast(this.childDocs[this.itemIndex + 1], Doc, null);
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        const childDocs = DocListCast(targetDoc[Doc.LayoutFieldKey(targetDoc)]);
        const currentFrame = Cast(targetDoc._currentFrame, "number", null);
        const lastFrame = Cast(targetDoc.lastFrame, "number", null);
        const curFrame = NumCast(targetDoc._currentFrame);
        let internalFrames: boolean = false;
        if (targetDoc.presProgressivize || activeItem.zoomProgressivize || targetDoc.scrollProgressivize) internalFrames = true;
        // Case 1: There are still other frames and should go through all frames before going to next slide
        if (internalFrames && lastFrame !== undefined && curFrame < lastFrame) {
            targetDoc._viewTransition = "all 1s";
            setTimeout(() => targetDoc._viewTransition = undefined, 1010);
            targetDoc._currentFrame = curFrame + 1;
            if (targetDoc.scrollProgressivize) CollectionFreeFormDocumentView.updateScrollframe(targetDoc, currentFrame);
            if (targetDoc.presProgressivize) CollectionFreeFormDocumentView.updateKeyframe(childDocs, currentFrame || 0, targetDoc);
            else targetDoc.editing = true;
            if (activeItem.zoomProgressivize) this.zoomProgressivizeNext(targetDoc);
            // Case 2: Audio or video therefore wait to play the audio or video before moving on
        } else if ((targetDoc.type === DocumentType.AUDIO) && !this._moveOnFromAudio && this.layoutDoc.presStatus !== 'auto') {
            AudioBox.Instance.playFrom(0);
            this._moveOnFromAudio = true;
            // Case 3: No more frames in current doc and next slide is defined, therefore move to next slide
        } else if (this.childDocs[this.itemIndex + 1] !== undefined) {
            const nextSelected = this.itemIndex + 1;
            if (targetDoc.type === DocumentType.AUDIO) AudioBox.Instance.pause();
            this.gotoDocument(nextSelected, this.itemIndex);
            const targetNext = Cast(activeNext.presentationTargetDoc, Doc, null);
            if (activeNext && targetNext.type === DocumentType.AUDIO && activeNext.playAuto) {
                AudioBox.Instance.playFrom(0);
                this._moveOnFromAudio = true;
            } else this._moveOnFromAudio = false;
        } else if (this.childDocs[this.itemIndex + 1] === undefined && this.layoutDoc.presLoop) {
            const nextSelected = 0;
            this.gotoDocument(0, this.itemIndex);
        }
    }

    /**
     * Called when the user moves back
     * Design choice: If there are frames within the presentation, moving back will not
     * got back through the frames but instead directly to the next point in the presentation.
     */
    @undoBatch
    @action
    back = () => {
        this.updateCurrentPresentation();
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        const prevItem = Cast(this.childDocs[Math.max(0, this.itemIndex - 1)], Doc, null);
        const prevTargetDoc = Cast(prevItem.presentationTargetDoc, Doc, null);
        const lastFrame = Cast(targetDoc.lastFrame, "number", null);
        const curFrame = NumCast(targetDoc._currentFrame);
        if (lastFrame !== undefined && curFrame >= 1) {
            this.prevKeyframe(targetDoc, activeItem);
        } else if (activeItem) {
            let prevSelected = this.itemIndex;
            prevSelected = Math.max(0, prevSelected - 1);
            this.gotoDocument(prevSelected, this.itemIndex);
            if (NumCast(prevTargetDoc.lastFrame) > 0) prevTargetDoc._currentFrame = NumCast(prevTargetDoc.lastFrame);
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
            this._selectedArray = [this.childDocs[index]]; //Update selected array
            //Handles movement to element
            if (this.layoutDoc._viewType === "stacking") this.navigateToElement(this.childDocs[index]);
            this.onHideDocument(); //Handles hide after/before
        }
    });

    /**
     * This method makes sure that cursor navigates to the element that
     * has the option open and last in the group. 
     * Design choice: If the next document is not in presCollection or 
     * presCollection itself then if there is a presCollection it will add
     * a new tab. If presCollection is undefined it will open the document
     * on the right. 
     */
    navigateToElement = async (curDoc: Doc) => {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        const srcContext = await DocCastAsync(targetDoc.context);
        const presCollection = Cast(this.layoutDoc.presCollection, Doc, null);
        const collectionDocView = presCollection ? await DocumentManager.Instance.getDocumentView(presCollection) : undefined;
        this.turnOffEdit();

        if (this.itemIndex >= 0) {
            if (srcContext && targetDoc) {
                this.layoutDoc.presCollection = srcContext;
            } else if (targetDoc) this.layoutDoc.presCollection = targetDoc;
        }
        if (collectionDocView) {
            if (srcContext && srcContext !== presCollection) {
                // Case 1: new srcContext inside of current collection so add a new tab to the current pres collection
                collectionDocView.props.addDocTab(srcContext, "inPlace");
            }
        }
        this.updateCurrentPresentation();
        const docToJump = curDoc;
        const willZoom = false;

        // If openDocument is selected then it should open the document for the user
        if (activeItem.openDocument) {
            this.props.addDocTab(activeItem, "replace");
        } else
            //docToJump stayed same meaning, it was not in the group or was the last element in the group
            if (activeItem.zoomProgressivize && this.rootDoc.presStatus !== 'edit') {
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
        // After navigating to the document, if it is added as a presPinView then it will
        // adjust the pan and scale to that of the pinView when it was added.
        // TODO: Add option to remove presPinView 
        if (activeItem.presPinView) {
            // if targetDoc is not displayed but one of its aliases is, then we need to modify that alias, not the original target
            const bestTarget = DocumentManager.Instance.getFirstDocumentView(targetDoc)?.props.Document;
            bestTarget && runInAction(() => {
                bestTarget._viewTransition = "all 1s";
                bestTarget._panX = activeItem.presPinViewX;
                bestTarget._panY = activeItem.presPinViewY;
                bestTarget._viewScale = activeItem.presPinViewScale;
            });
            //setTimeout(() => targetDoc._viewTransition = undefined, 1010);
        }
        // If website and has presWebsite data associated then on click it should
        // go back to that specific website
        // TODO: Add progressivize for navigating web (storing websites for given frames)
        if (targetDoc.presWebsiteData) {
            targetDoc.data = targetDoc.presWebsiteData;
        }
    }

    /**
     * Uses the viewfinder to progressivize through the different views of a single collection.
     * @param presTargetDoc: document for which internal zoom is used
     */
    zoomProgressivizeNext = (activeItem: Doc) => {
        const targetDoc: Doc = this.targetDoc;
        const srcContext = Cast(targetDoc?.context, Doc, null);
        const docView = DocumentManager.Instance.getDocumentView(targetDoc);
        const vfLeft = this.checkList(targetDoc, activeItem["viewfinder-left-indexed"]);
        const vfWidth = this.checkList(targetDoc, activeItem["viewfinder-width-indexed"]);
        const vfTop = this.checkList(targetDoc, activeItem["viewfinder-top-indexed"]);
        const vfHeight = this.checkList(targetDoc, activeItem["viewfinder-height-indexed"]);
        // Case 1: document that is not a Golden Layout tab
        if (srcContext) {
            const srcDocView = DocumentManager.Instance.getDocumentView(srcContext);
            if (srcDocView) {
                const layoutdoc = Doc.Layout(targetDoc);
                const panelWidth: number = srcDocView.props.PanelWidth();
                const panelHeight: number = srcDocView.props.PanelHeight();
                const newPanX = NumCast(targetDoc.x) + NumCast(layoutdoc._width) / 2;
                const newPanY = NumCast(targetDoc.y) + NumCast(layoutdoc._height) / 2;
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
            targetDoc._panX = vfLeft + (vfWidth / 2);
            targetDoc._panY = vfTop + (vfWidth / 2);
            targetDoc._viewScale = newScale;
        }
        const resize = document.getElementById('resizable');
        if (resize) {
            resize.style.width = vfWidth + 'px';
            resize.style.height = vfHeight + 'px';
            resize.style.top = vfTop + 'px';
            resize.style.left = vfLeft + 'px';
        }
    }


    /**
     * For 'Hide Before' and 'Hide After' buttons making sure that
     * they are hidden each time the presentation is updated.
     */
    @action
    onHideDocument = () => {
        this.childDocs.forEach((doc, index) => {
            const curDoc = Cast(doc, Doc, null);
            const tagDoc = Cast(curDoc.presentationTargetDoc!, Doc, null);
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



    //The function that starts or resets presentaton functionally, depending on presStatus of the layoutDoc
    @undoBatch
    @action
    startAutoPres = (startSlide: number) => {
        this.updateCurrentPresentation();
        let activeItem: Doc = this.activeItem;
        let targetDoc: Doc = this.targetDoc;
        let duration = NumCast(targetDoc.presDuration) + NumCast(targetDoc.presTransition);
        const timer = (ms: number) => new Promise(res => this._presTimer = setTimeout(res, ms));
        const load = async () => { // Wrap the loop into an async function for this to work
            for (var i = startSlide; i < this.childDocs.length; i++) {
                activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
                targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
                duration = NumCast(targetDoc.presDuration) + NumCast(targetDoc.presTransition);
                if (duration <= 100) { duration = 2500; }
                if (NumCast(targetDoc.lastFrame) > 0) {
                    for (var f = 0; f < NumCast(targetDoc.lastFrame); f++) {
                        await timer(duration / NumCast(targetDoc.lastFrame));
                        this.next();
                    }
                }
                await timer(duration); this.next(); // then the created Promise can be awaited
                if (i === this.childDocs.length - 1) {
                    setTimeout(() => {
                        clearTimeout(this._presTimer);
                        if (this.layoutDoc.presStatus === 'auto' && !this.layoutDoc.presLoop) this.layoutDoc.presStatus = "manual";
                        else if (this.layoutDoc.presLoop) this.startAutoPres(0);
                    }, duration);
                }
            }
        };
        this.layoutDoc.presStatus = "auto";
        this.startPresentation(startSlide);
        this.gotoDocument(startSlide, this.itemIndex);
        load();
    }

    @action
    pauseAutoPres = () => {
        if (this.layoutDoc.presStatus === "auto") {
            if (this._presTimer) clearTimeout(this._presTimer);
            this.layoutDoc.presStatus = "manual";
            this.layoutDoc.presLoop = false;
        }
    }

    //The function that resets the presentation by removing every action done by it. It also
    //stops the presentaton.
    resetPresentation = () => {
        this.updateCurrentPresentation();
        this.rootDoc._itemIndex = 0;
    }

    @action togglePath = () => this.pathBoolean = !this.pathBoolean;
    @action toggleExpandMode = () => {
        this.rootDoc.expandBoolean = !this.rootDoc.expandBoolean;
        this.childDocs.forEach((doc) => {
            if (this.rootDoc.expandBoolean) doc.presExpandInlineButton = true;
            else if (!this.rootDoc.expandBoolean) doc.presExpandInlineButton = false;
        });
    }

    /**
     * The function that starts the presentation at the given index, also checking if actions should be applied
     * directly at start.
     * @param startIndex: index that the presentation will start at
     */
    startPresentation = (startIndex: number) => {
        this.updateCurrentPresentation();
        this.childDocs.map(doc => {
            const tagDoc = doc.presentationTargetDoc as Doc;
            if (doc.presHideTillShownButton && this.childDocs.indexOf(doc) > startIndex) {
                tagDoc.opacity = 0;
            }
            if (doc.presHideAfterButton && this.childDocs.indexOf(doc) < startIndex) {
                tagDoc.opacity = 0;
            }
        });
    }

    /**
     * The method called to open the presentation as a minimized view
     * TODO: Look at old updateMinimize and compare...
     */
    @undoBatch
    @action
    updateMinimize = () => {
        const docView = DocumentManager.Instance.getDocumentView(this.layoutDoc);
        if (this.layoutDoc.inOverlay) {
            this.layoutDoc.presStatus = 'edit';
            Doc.RemoveDocFromList((Doc.UserDoc().myOverlayDocs as Doc), undefined, this.rootDoc);
            CollectionDockingView.AddRightSplit(this.rootDoc);
            this.layoutDoc.inOverlay = false;
        } else if (this.layoutDoc.context && docView) {
            this.layoutDoc.presStatus = 'manual';
            const pt = this.props.ScreenToLocalTransform().inverse().transformPoint(0, 0);
            this.rootDoc.x = pt[0] + (this.props.PanelWidth() - 250);
            this.rootDoc.y = pt[1] + 10;
            this.rootDoc._height = 35;
            this.rootDoc._width = 250;
            docView.props.removeDocument?.(this.layoutDoc);
            Doc.AddDocToList((Doc.UserDoc().myOverlayDocs as Doc), undefined, this.rootDoc);
        } else {
            this.layoutDoc.presStatus = 'manual';
            const pt = this.props.ScreenToLocalTransform().inverse().transformPoint(0, 0);
            this.rootDoc.x = pt[0] + (this.props.PanelWidth() - 250);
            this.rootDoc.y = pt[1] + 10;
            this.rootDoc._height = 35;
            this.rootDoc._width = 250;
            this.props.addDocTab?.(this.rootDoc, "close");
            Doc.AddDocToList((Doc.UserDoc().myOverlayDocs as Doc), undefined, this.rootDoc);
        }
    }

    /**
     * Called when the user changes the view type
     * Either 'List' (stacking) or 'Slides' (carousel)
     */
    @undoBatch
    viewChanged = action((e: React.ChangeEvent) => {
        //@ts-ignore
        const viewType = e.target.selectedOptions[0].value as CollectionViewType;
        // pivot field may be set by the user in timeline view (or some other way) -- need to reset it here
        viewType === CollectionViewType.Stacking && (this.rootDoc._pivotField = undefined);
        this.rootDoc._viewType = viewType;
        if (viewType === CollectionViewType.Stacking) this.layoutDoc._gridGap = 5;
    });

    /**
     * When the movement dropdown is changes
     */
    @undoBatch
    updateMovement = action((movement: any, activeItem: Doc, targetDoc: Doc) => {
        switch (movement) {
            case 'zoom': //Pan and zoom
                activeItem.presNavButton = false;
                activeItem.presZoomButton = !activeItem.presZoomButton;
                targetDoc.presTransition = activeItem.presTransition;
                if (activeItem.presZoomButton) activeItem.presMovement = 'zoom';
                else activeItem.presMovement = 'none';
                break;
            case 'pan': //Pan
                activeItem.presZoomButton = false;
                activeItem.presNavButton = !activeItem.presNavButton;
                targetDoc.presTransition = activeItem.presTransition;
                if (activeItem.presNavButton) activeItem.presMovement = 'pan';
                else activeItem.presMovement = 'none';
                break;
            case 'jump': //Jump Cut
                activeItem.presTransition = targetDoc.presTransition;
                targetDoc.presTransition = 0;
                activeItem.presZoomButton = true;
                activeItem.presSwitchButton = !activeItem.presSwitchButton;
                if (activeItem.presSwitchButton) activeItem.presMovement = 'jump';
                else activeItem.presMovement = 'none';
                break;
            case 'none': default:
                activeItem.presMovement = 'none';
                activeItem.presZoomButton = false;
                activeItem.presNavButton = false;
                activeItem.presSwitchButton = false;
                break;
        }
    });

    setMovementName = action((movement: any, activeItem: Doc): string => {
        let output: string = 'none';
        switch (movement) {
            case 'zoom': output = 'Zoom'; break; //Pan and zoom
            case 'pan': output = 'Pan'; break; //Pan
            case 'jump': output = 'Jump cut'; break; //Jump Cut
            case 'none': output = 'None'; break; //None
            default: output = 'Zoom'; activeItem.presMovement = 'zoom'; break; //default set as zoom
        }
        return output;
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
                if (this.rootDoc.expandBoolean) doc.presExpandInlineButton = true;
            }
        });
        return true;
    }
    childLayoutTemplate = () => this.rootDoc._viewType !== CollectionViewType.Stacking ? undefined : this.presElement;
    removeDocument = (doc: Doc) => { Doc.RemoveDocFromList(this.dataDoc, this.fieldKey, doc); };
    getTransform = () => this.props.ScreenToLocalTransform().translate(-5, -65);// listBox padding-left and pres-box-cont minHeight
    panelHeight = () => this.props.PanelHeight() - 40;
    active = (outsideReaction?: boolean) => ((Doc.GetSelectedTool() === InkTool.None && !this.layoutDoc._isBackground) &&
        (this.layoutDoc.forceActive || this.props.isSelected(outsideReaction) || this._isChildActive || this.props.renderDepth === 0) ? true : false)

    /**
     * For sorting the array so that the order is maintained when it is dropped.
     */
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

    /**
     * Method to get the list of selected items in the order in which they have been selected
     */
    @computed get listOfSelected() {
        const list = this._selectedArray.map((doc: Doc, index: any) => {
            const curDoc = Cast(doc, Doc, null);
            const tagDoc = Cast(curDoc.presentationTargetDoc!, Doc, null);
            return (
                <div className="selectedList-items">{index + 1}.  {tagDoc.title}</div>
            );
        });
        return list;
    }

    @action
    selectPres = () => {
        const presDocView = DocumentManager.Instance.getDocumentView(PresBox.Instance.rootDoc)!;
        SelectionManager.SelectDoc(presDocView, false);
    }

    //Regular click
    @action
    selectElement = (doc: Doc) => {
        this.gotoDocument(this.childDocs.indexOf(doc), NumCast(this.itemIndex));
        this.selectPres();
    }

    //Command click
    @action
    multiSelect = (doc: Doc, ref: HTMLElement, drag: HTMLElement) => {
        if (!this._selectedArray.includes(doc)) {
            this._selectedArray.push(doc);
            this._eleArray.push(ref);
            this._dragArray.push(drag);
        }
        this.selectPres();
    }

    //Shift click
    @action
    shiftSelect = (doc: Doc, ref: HTMLElement, drag: HTMLElement) => {
        this._selectedArray = [];
        // const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        if (this.activeItem) {
            for (let i = Math.min(this.itemIndex, this.childDocs.indexOf(doc)); i <= Math.max(this.itemIndex, this.childDocs.indexOf(doc)); i++) {
                this._selectedArray.push(this.childDocs[i]);
                this._eleArray.push(ref);
                this._dragArray.push(drag);
            }
        }
        this.selectPres();
    }

    // Key for when the presentaiton is active
    @undoBatch
    keyEvents = action((e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement) return;
        let handled = false;
        const anchorNode = document.activeElement as HTMLDivElement;
        if (anchorNode && anchorNode.className?.includes("lm_title")) return;
        if (e.keyCode === 27) { // Escape key
            if (this.layoutDoc.inOverlay) { this.updateMinimize(); }
            else if (this.layoutDoc.presStatus === "edit") { this._selectedArray = []; this._eleArray = []; this._dragArray = []; }
            else this.layoutDoc.presStatus = "edit";
            if (this._presTimer) clearTimeout(this._presTimer);
            handled = true;
        } if ((e.metaKey || e.altKey) && e.keyCode === 65) { // Ctrl-A to select all
            if (this.layoutDoc.presStatus === "edit") {
                this._selectedArray = this.childDocs;
                handled = true;
            }
        } if (e.keyCode === 37 || e.keyCode === 38) { // left(37) / a(65) / up(38) to go back
            this.back();
            if (this._presTimer) clearTimeout(this._presTimer);
            handled = true;
        } if (e.keyCode === 39 || e.keyCode === 40) { // right (39) / d(68) / down(40) to go to next
            this.next();
            if (this._presTimer) clearTimeout(this._presTimer);
            handled = true;
        } if (e.keyCode === 32) { // spacebar to 'present' or autoplay
            if (this.layoutDoc.presStatus !== "edit") this.startAutoPres(0);
            else this.layoutDoc.presStatus = "manual"; if (this._presTimer) clearTimeout(this._presTimer);
            handled = true;
        } if (e.keyCode === 8) { // delete selected items
            if (this.layoutDoc.presStatus === "edit") {
                this._selectedArray.forEach((doc, i) => this.removeDocument(doc));
                this._selectedArray = [];
                this._eleArray = [];
                this._dragArray = [];
                handled = true;
            }
        } if (handled) {
            e.stopPropagation();
            e.preventDefault();
        } if ((e.keyCode === 37 || e.keyCode === 38) && e.shiftKey) { // left(37) / a(65) / up(38) to go back
            if (this.layoutDoc.presStatus === "edit" && this._selectedArray.length > 0) {
                const index = this.childDocs.indexOf(this._selectedArray[this._selectedArray.length]);
                if ((index - 1) > 0) this._selectedArray.push(this.childDocs[index - 1]);
            }
            handled = true;
        } if ((e.keyCode === 39 || e.keyCode === 40) && e.shiftKey) { // left(37) / a(65) / up(38) to go back
            if (this.layoutDoc.presStatus === "edit" && this._selectedArray.length > 0) {
                const index = this.childDocs.indexOf(this._selectedArray[this._selectedArray.length]);
                if ((index - 1) > 0) {
                    this._selectedArray.push(this.childDocs[index - 1]);
                }
            }
            handled = true;
        }
    });

    /**
     * 
     */
    @undoBatch
    @action
    viewPaths = async () => {
        const srcContext = Cast(this.rootDoc.presCollection, Doc, null);
        if (this.pathBoolean && srcContext) {
            this.togglePath();
            srcContext.presPathView = false;
        } else if (srcContext) {
            this.togglePath();
            srcContext.presPathView = true;
        }
    }

    // Adds the index in the pres path graphically
    @computed get order() {
        const order: JSX.Element[] = [];
        this.childDocs.forEach((doc, index) => {
            const tagDoc = Cast(doc.presentationTargetDoc, Doc, null);
            const srcContext = Cast(tagDoc?.context, Doc, null);
            // Case A: Document is contained within the colleciton
            if (this.rootDoc.presCollection === srcContext) {
                order.push(
                    <div className="pathOrder" style={{ top: NumCast(tagDoc.y), left: NumCast(tagDoc.x) }}>
                        <div className="pathOrder-frame">{index + 1}</div>
                    </div>);
                // Case B: Document is not inside of the collection
            } else {
                order.push(
                    <div className="pathOrder" style={{ top: 0, left: 0 }}>
                        <div className="pathOrder-frame">{index + 1}</div>
                    </div>);
            }
        });
        return order;
    }

    /**
     * Method called for viewing paths which adds a single line with
     * points at the center of each document added.
     * Design choice: When this is called it sets _fitToBox as true so the
     * user can have an overview of all of the documents in the collection.
     * (Design needed for when documents in presentation trail are in another
     * collection)
     */
    @computed get paths() {
        let pathPoints = "";
        this.childDocs.forEach((doc, index) => {
            const tagDoc = Cast(doc.presentationTargetDoc, Doc, null);
            const srcContext = Cast(tagDoc?.context, Doc, null);
            if (tagDoc && this.rootDoc.presCollection === srcContext) {
                const n1x = NumCast(tagDoc.x) + (NumCast(tagDoc._width) / 2);
                const n1y = NumCast(tagDoc.y) + (NumCast(tagDoc._height) / 2);
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

    /**
     * The function that is called on click to turn fading document after presented option on/off.
     * It also makes sure that the option swithches from hide-after to this one, since both
     * can't coexist.
     */
    @action
    onFadeDocumentAfterPresentedClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
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

    // Converts seconds to ms and updates presTransition
    setTransitionTime = (number: String, change?: number) => {
        let timeInMS = Number(number) * 1000;
        if (change) timeInMS += change;
        if (timeInMS < 100) timeInMS = 100;
        if (timeInMS > 10000) timeInMS = 10000;
        if (this.targetDoc) this.targetDoc.presTransition = timeInMS;
    }

    // Converts seconds to ms and updates presDuration
    setDurationTime = (number: String, change?: number) => {
        let timeInMS = Number(number) * 1000;
        if (change) timeInMS += change;
        if (timeInMS < 100) timeInMS = 100;
        if (timeInMS > 20000) timeInMS = 20000;
        if (this.targetDoc) this.targetDoc.presDuration = timeInMS;
    }


    @computed get transitionDropdown() {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        if (activeItem && targetDoc) {
            const transitionSpeed = targetDoc.presTransition ? NumCast(targetDoc.presTransition) / 1000 : 0.5;
            let duration = targetDoc.presDuration ? NumCast(targetDoc.presDuration) / 1000 : 2;
            if (targetDoc.type === DocumentType.AUDIO) duration = NumCast(targetDoc.duration);
            const effect = targetDoc.presEffect ? targetDoc.presEffect : 'None';
            activeItem.presMovement = activeItem.presMovement ? activeItem.presMovement : 'Zoom';
            return (
                <div className={`presBox-ribbon ${this.transitionTools && this.layoutDoc.presStatus === "edit" ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onClick={action(e => { e.stopPropagation(); this.openMovementDropdown = false; this.openEffectDropdown = false; })}>
                    <div className="ribbon-box">
                        Movement
                        <div className="presBox-dropdown" onClick={action(e => { e.stopPropagation(); this.openMovementDropdown = !this.openMovementDropdown; })} style={{ borderBottomLeftRadius: this.openMovementDropdown ? 0 : 5, border: this.openMovementDropdown ? 'solid 2px #5B9FDD' : 'solid 1px black' }}>
                            {this.setMovementName(activeItem.presMovement, activeItem)}
                            <FontAwesomeIcon className='presBox-dropdownIcon' style={{ gridColumn: 2, color: this.openMovementDropdown ? '#5B9FDD' : 'black' }} icon={"angle-down"} />
                            <div className={'presBox-dropdownOptions'} id={'presBoxMovementDropdown'} onPointerDown={e => e.stopPropagation()} style={{ display: this.openMovementDropdown ? "grid" : "none" }}>
                                <div className={`presBox-dropdownOption ${activeItem.presMovement === 'none' ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateMovement('none', activeItem, targetDoc)}>None</div>
                                <div className={`presBox-dropdownOption ${activeItem.presMovement === 'zoom' ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateMovement('zoom', activeItem, targetDoc)}>Pan and Zoom</div>
                                <div className={`presBox-dropdownOption ${activeItem.presMovement === 'pan' ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateMovement('pan', activeItem, targetDoc)}>Pan</div>
                                <div className={`presBox-dropdownOption ${activeItem.presMovement === 'jump' ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateMovement('jump', activeItem, targetDoc)}>Jump cut</div>
                            </div>
                        </div>
                        <div className="ribbon-doubleButton" style={{ display: activeItem.presMovement === 'pan' || activeItem.presMovement === 'zoom' ? "inline-flex" : "none" }}>
                            <div className="presBox-subheading">Transition Speed</div>
                            <div className="ribbon-property">
                                <input className="presBox-input"
                                    type="number" value={transitionSpeed}
                                    onFocus={() => document.removeEventListener("keydown", this.keyEvents, true)}
                                    onChange={action((e) => this.setTransitionTime(e.target.value))} /> s
                            </div>
                            <div className="ribbon-propertyUpDown">
                                <div className="ribbon-propertyUpDownItem" onClick={() => this.setTransitionTime(String(transitionSpeed), 1000)}>
                                    <FontAwesomeIcon icon={"caret-up"} />
                                </div>
                                <div className="ribbon-propertyUpDownItem" onClick={() => this.setTransitionTime(String(transitionSpeed), -1000)}>
                                    <FontAwesomeIcon icon={"caret-down"} />
                                </div>
                            </div>
                        </div>
                        <input type="range" step="0.1" min="0.1" max="10" value={transitionSpeed} className={`toolbar-slider ${activeItem.presMovement === 'pan' || activeItem.presMovement === 'zoom' ? "" : "none"}`} id="toolbar-slider" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { e.stopPropagation(); this.setTransitionTime(e.target.value); }} />
                        <div className={`slider-headers ${activeItem.presMovement === 'pan' || activeItem.presMovement === 'zoom' ? "" : "none"}`}>
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
                            <div className="ribbon-property">
                                <input className="presBox-input"
                                    type="number" value={duration}
                                    onFocus={() => document.removeEventListener("keydown", this.keyEvents, true)}
                                    onChange={action((e) => this.setDurationTime(e.target.value))} /> s
                            </div>
                            <div className="ribbon-propertyUpDown">
                                <div className="ribbon-propertyUpDownItem" onClick={() => this.setDurationTime(String(duration), 1000)}>
                                    <FontAwesomeIcon icon={"caret-up"} />
                                </div>
                                <div className="ribbon-propertyUpDownItem" onClick={() => this.setDurationTime(String(duration), -1000)}>
                                    <FontAwesomeIcon icon={"caret-down"} />
                                </div>
                            </div>
                        </div>
                        <input type="range" step="0.1" min="0.1" max="20" value={duration} style={{ display: targetDoc.type === DocumentType.AUDIO ? "none" : "block" }} className={"toolbar-slider"} id="duration-slider" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { e.stopPropagation(); this.setDurationTime(e.target.value); }} />
                        <div className={"slider-headers"} style={{ display: targetDoc.type === DocumentType.AUDIO ? "none" : "grid" }}>
                            <div className="slider-text">Short</div>
                            <div className="slider-text">Medium</div>
                            <div className="slider-text">Long</div>
                        </div>
                    </div>
                    <div className="ribbon-box">
                        Effects
                        <div className="presBox-dropdown" onClick={action(e => { e.stopPropagation(); this.openEffectDropdown = !this.openEffectDropdown; })} style={{ borderBottomLeftRadius: this.openEffectDropdown ? 0 : 5, border: this.openEffectDropdown ? 'solid 2px #5B9FDD' : 'solid 1px black' }}>
                            {effect}
                            <FontAwesomeIcon className='presBox-dropdownIcon' style={{ gridColumn: 2, color: this.openEffectDropdown ? '#5B9FDD' : 'black' }} icon={"angle-down"} />
                            <div className={'presBox-dropdownOptions'} id={'presBoxMovementDropdown'} style={{ display: this.openEffectDropdown ? "grid" : "none" }} onPointerDown={e => e.stopPropagation()}>
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
                </div >
            );
        }
    }

    @computed get effectDirection(): string {
        let effect = '';
        switch (this.targetDoc.presEffectDirection) {
            case 'left': effect = "Enter from left"; break;
            case 'right': effect = "Enter from right"; break;
            case 'top': effect = "Enter from top"; break;
            case 'bottom': effect = "Enter from bottom"; break;
            default: effect = "Enter from center"; break;
        }
        return effect;
    }

    @undoBatch
    @action
    applyTo = (array: Doc[]) => {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        array.forEach((doc, index) => {
            const curDoc = Cast(doc, Doc, null);
            const tagDoc = Cast(curDoc.presentationTargetDoc, Doc, null);
            if (tagDoc && targetDoc) {
                tagDoc.presTransition = targetDoc.presTransition;
                tagDoc.presDuration = targetDoc.presDuration;
                tagDoc.presEffect = targetDoc.presEffect;
                tagDoc.presEffectDirection = targetDoc.presEffectDirection;
                curDoc.presMovement = activeItem.presMovement;
                this.updateMovement(activeItem.presMovement, curDoc, tagDoc);
                curDoc.presHideTillShownButton = activeItem.presHideTillShownButton;
                curDoc.presHideAfterButton = activeItem.presHideAfterButton;
            }
        });
    }
    @computed get optionsDropdown() {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        if (activeItem && targetDoc) {
            return (
                <div>
                    <div className={'presBox-ribbon'} onClick={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                        <div className="ribbon-box">
                            <div className="ribbon-doubleButton" style={{ display: targetDoc.type === DocumentType.VID || targetDoc.type === DocumentType.AUDIO ? "inline-flex" : "none" }}>
                                <div className="ribbon-button" style={{ backgroundColor: activeItem.playAuto ? "#aedef8" : "" }} onClick={() => activeItem.playAuto = !activeItem.playAuto}>Play automatically</div>
                                <div className="ribbon-button" style={{ display: "flex", backgroundColor: activeItem.playAuto ? "" : "#aedef8" }} onClick={() => activeItem.playAuto = !activeItem.playAuto}>Play on next</div>
                            </div>
                            <div className="ribbon-doubleButton" style={{ display: "flex" }}>
                                <div className="ribbon-button" style={{ backgroundColor: activeItem.openDocument ? "#aedef8" : "" }} onClick={() => activeItem.openDocument = !activeItem.openDocument}>Open document</div>
                            </div>
                            <div className="ribbon-doubleButton" style={{ display: targetDoc.type === DocumentType.COL ? "inline-flex" : "none" }}>
                                <div className="ribbon-button" style={{ backgroundColor: activeItem.presPinView ? "#aedef8" : "" }}
                                    onClick={() => {
                                        activeItem.presPinView = !activeItem.presPinView;
                                        targetDoc.presPinView = activeItem.presPinView;
                                        if (activeItem.presPinView) {
                                            const x = targetDoc._panX;
                                            const y = targetDoc._panY;
                                            const scale = targetDoc._viewScale;
                                            activeItem.presPinViewX = x;
                                            activeItem.presPinViewY = y;
                                            activeItem.presPinViewScale = scale;
                                        }
                                    }}>Presentation pin view</div>
                            </div>
                            <div style={{ display: activeItem.presPinView ? "block" : "none" }}>
                                <div className="ribbon-doubleButton" style={{ marginRight: 10 }}>
                                    <div className="presBox-subheading">Pan X</div>
                                    <div className="ribbon-property" style={{ paddingRight: 0, paddingLeft: 0 }}>
                                        <input className="presBox-input"
                                            style={{ textAlign: 'left', width: 50 }}
                                            type="number" value={NumCast(activeItem.presPinViewX)}
                                            onFocus={() => document.removeEventListener("keydown", this.keyEvents, true)}
                                            onChange={action((e: React.ChangeEvent<HTMLInputElement>) => { const val = e.target.value; activeItem.presPinViewX = Number(val); })} />
                                    </div>
                                </div>
                                <div className="ribbon-doubleButton" style={{ marginRight: 10 }}>
                                    <div className="presBox-subheading">Pan Y</div>
                                    <div className="ribbon-property" style={{ paddingRight: 0, paddingLeft: 0 }}>
                                        <input className="presBox-input"
                                            style={{ textAlign: 'left', width: 50 }}
                                            type="number" value={NumCast(activeItem.presPinViewY)}
                                            onFocus={() => document.removeEventListener("keydown", this.keyEvents, true)}
                                            onChange={action((e: React.ChangeEvent<HTMLInputElement>) => { const val = e.target.value; activeItem.presPinViewY = Number(val); })} />
                                    </div>
                                </div>
                                <div className="ribbon-doubleButton" style={{ marginRight: 10 }}>
                                    <div className="presBox-subheading">Scale</div>
                                    <div className="ribbon-property" style={{ paddingRight: 0, paddingLeft: 0 }}>
                                        <input className="presBox-input"
                                            style={{ textAlign: 'left', width: 50 }}
                                            type="number" value={NumCast(activeItem.presPinViewScale)}
                                            onFocus={() => document.removeEventListener("keydown", this.keyEvents, true)}
                                            onChange={action((e: React.ChangeEvent<HTMLInputElement>) => { const val = e.target.value; activeItem.presPinViewScale = Number(val); })} />
                                    </div>
                                </div>
                            </div>
                            {/* <div className="ribbon-doubleButton" style={{ display: targetDoc.type === DocumentType.WEB ? "inline-flex" : "none" }}>
                                <div className="ribbon-button" onClick={this.progressivizeText}>Store original website</div>
                            </div> */}
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
                <div className={"presBox-ribbon"} onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                    <div className="ribbon-box">
                        Slide Title: <br></br>
                        <input className="ribbon-textInput" placeholder="..." type="text" name="fname"
                            onFocus={() => document.removeEventListener("keydown", this.keyEvents, true)}
                            onChange={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                runInAction(() => this.title = e.target.value);
                            }}></input>
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
        if (doc) {
            const presCollection = Cast(this.layoutDoc.presCollection, Doc, null);
            const data = Cast(presCollection?.data, listSpec(Doc));
            const presData = Cast(this.rootDoc.data, listSpec(Doc));
            if (data && presData) {
                data.push(doc);
                DockedFrameRenderer.PinDoc(doc, false);
                this.gotoDocument(this.childDocs.length, this.itemIndex);
            } else {
                this.props.addDocTab(doc, "onRight");
            }
        }
    }

    createTemplate = (layout: string, input?: string) => {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
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
        const content = Docs.Create.TextDocument("Click to change text", { title: "Slide text", _width: 380, _height: 145, x: 10, y: 70, _fontSize: "14pt" });
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

    // Dropdown that appears when the user wants to begin presenting (either minimize or sidebar view)
    @computed get presentDropdown() {
        return (
            <div className={`dropdown-play ${this.presentTools ? "active" : ""}`} onClick={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                <div className="dropdown-play-button" onClick={this.updateMinimize}>
                    Minimize
                </div>
                <div className="dropdown-play-button" onClick={(action(() => { this.layoutDoc.presStatus = "manual"; this.turnOffEdit(); }))}>
                    Sidebar view
                </div>
            </div>
        );
    }

    // Case in which the document has keyframes to navigate to next key frame
    @undoBatch
    @action
    nextKeyframe = (tagDoc: Doc, curDoc: Doc): void => {
        const childDocs = DocListCast(tagDoc[Doc.LayoutFieldKey(tagDoc)]);
        const currentFrame = Cast(tagDoc._currentFrame, "number", null);
        if (currentFrame === undefined) {
            tagDoc.currentFrame = 0;
            CollectionFreeFormDocumentView.setupScroll(tagDoc, 0);
            CollectionFreeFormDocumentView.setupKeyframes(childDocs, 0);
        }
        CollectionFreeFormDocumentView.updateScrollframe(tagDoc, currentFrame);
        CollectionFreeFormDocumentView.updateKeyframe(childDocs, currentFrame || 0, tagDoc);
        tagDoc._currentFrame = Math.max(0, (currentFrame || 0) + 1);
        tagDoc.lastFrame = Math.max(NumCast(tagDoc._currentFrame), NumCast(tagDoc.lastFrame));
        if (curDoc.zoomProgressivize) {
            const resize = document.getElementById('resizable');
            if (resize) {
                resize.style.width = this.checkList(tagDoc, curDoc["viewfinder-width-indexed"]) + 'px';
                resize.style.height = this.checkList(tagDoc, curDoc["viewfinder-height-indexed"]) + 'px';
                resize.style.top = this.checkList(tagDoc, curDoc["viewfinder-top-indexed"]) + 'px';
                resize.style.left = this.checkList(tagDoc, curDoc["viewfinder-left-indexed"]) + 'px';
            }
        }
    }

    @undoBatch
    @action
    prevKeyframe = (tagDoc: Doc, actItem: Doc): void => {
        const childDocs = DocListCast(tagDoc[Doc.LayoutFieldKey(tagDoc)]);
        const currentFrame = Cast(tagDoc._currentFrame, "number", null);
        if (currentFrame === undefined) {
            tagDoc._currentFrame = 0;
            CollectionFreeFormDocumentView.setupKeyframes(childDocs, 0);
        }
        CollectionFreeFormDocumentView.gotoKeyframe(childDocs.slice());
        tagDoc._currentFrame = Math.max(0, (currentFrame || 0) - 1);
        if (actItem.zoomProgressivize) {
            const resize = document.getElementById('resizable');
            if (resize) {
                resize.style.width = this.checkList(tagDoc, actItem["viewfinder-width-indexed"]) + 'px';
                resize.style.height = this.checkList(tagDoc, actItem["viewfinder-height-indexed"]) + 'px';
                resize.style.top = this.checkList(tagDoc, actItem["viewfinder-top-indexed"]) + 'px';
                resize.style.left = this.checkList(tagDoc, actItem["viewfinder-left-indexed"]) + 'px';
            }
        }
    }

    /**
     * Returns the collection type as a string for headers
     */
    @computed get stringType(): string {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        let type: string = '';
        if (activeItem) {
            switch (targetDoc.type) {
                case DocumentType.PDF: type = "PDF"; break;
                case DocumentType.RTF: type = "Text node"; break;
                case DocumentType.COL: type = "Collection"; break;
                case DocumentType.AUDIO: type = "Audio"; break;
                case DocumentType.VID: type = "Video"; break;
                case DocumentType.IMG: type = "Image"; break;
                case DocumentType.WEB: type = "Web page"; break;
                default: type = "Other node"; break;
            }
        }
        return type;
    }

    @observable private openActiveColorPicker: boolean = false;
    @observable private openViewedColorPicker: boolean = false;



    @computed get progressivizeDropdown() {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        if (activeItem && targetDoc) {
            const activeFontColor = targetDoc["pres-text-color"] ? StrCast(targetDoc["pres-text-color"]) : "Black";
            const viewedFontColor = targetDoc["pres-text-viewed-color"] ? StrCast(targetDoc["pres-text-viewed-color"]) : "Black";
            return (
                <div>
                    <div className={`presBox-ribbon ${this.progressivizeTools && this.layoutDoc.presStatus === "edit" ? "active" : ""}`} onClick={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                        <div className="ribbon-box">
                            {this.stringType} selected
                            <div className="ribbon-doubleButton" style={{ borderTop: 'solid 1px darkgrey', display: targetDoc.type === DocumentType.COL && targetDoc._viewType === 'freeform' ? "inline-flex" : "none" }}>
                                <div className="ribbon-button" style={{ backgroundColor: activeItem.presProgressivize ? "#aedef8" : "" }} onClick={this.progressivizeChild}>Contents</div>
                                <div className="ribbon-button" style={{ opacity: activeItem.presProgressivize ? 1 : 0.4, backgroundColor: targetDoc.editProgressivize ? "#aedef8" : "" }} onClick={this.editProgressivize}>Edit</div>
                            </div>
                            <div className="ribbon-doubleButton" style={{ display: activeItem.presProgressivize ? "inline-flex" : "none" }}>
                                <div className="presBox-subheading">Active text color</div>
                                <div className="ribbon-property" style={{ backgroundColor: activeFontColor }} onClick={action(() => { this.openActiveColorPicker = !this.openActiveColorPicker; })}>
                                </div>
                            </div>
                            {this.activeColorPicker}
                            <div className="ribbon-doubleButton" style={{ display: activeItem.presProgressivize ? "inline-flex" : "none" }}>
                                <div className="presBox-subheading">Viewed font color</div>
                                <div className="ribbon-property" style={{ backgroundColor: viewedFontColor }} onClick={action(() => this.openViewedColorPicker = !this.openViewedColorPicker)}>
                                </div>
                            </div>
                            {this.viewedColorPicker}
                            {/* <div className="ribbon-doubleButton" style={{ borderTop: 'solid 1px darkgrey', display: (targetDoc.type === DocumentType.COL && targetDoc._viewType === 'freeform') || targetDoc.type === DocumentType.IMG ? "inline-flex" : "none" }}>
                                <div className="ribbon-button" style={{ backgroundColor: activeItem.zoomProgressivize ? "#aedef8" : "" }} onClick={this.progressivizeZoom}>Zoom</div>
                                <div className="ribbon-button" style={{ opacity: activeItem.zoomProgressivize ? 1 : 0.4, backgroundColor: activeItem.editZoomProgressivize ? "#aedef8" : "" }} onClick={this.editZoomProgressivize}>Edit</div>
                            </div> */}
                            <div className="ribbon-doubleButton" style={{ borderTop: 'solid 1px darkgrey', display: targetDoc._viewType === "stacking" || targetDoc.type === DocumentType.PDF || targetDoc.type === DocumentType.WEB || targetDoc.type === DocumentType.RTF ? "inline-flex" : "none" }}>
                                <div className="ribbon-button" style={{ backgroundColor: activeItem.scrollProgressivize ? "#aedef8" : "" }} onClick={this.progressivizeScroll}>Scroll</div>
                                <div className="ribbon-button" style={{ opacity: activeItem.scrollProgressivize ? 1 : 0.4, backgroundColor: targetDoc.editScrollProgressivize ? "#aedef8" : "" }} onClick={this.editScrollProgressivize}>Edit</div>
                            </div>
                        </div>
                        <div className="ribbon-final-box" style={{ display: activeItem.zoomProgressivize || activeItem.scrollProgressivize || activeItem.presProgressivize || activeItem.textProgressivize ? "grid" : "none" }}>
                            Frames
                            <div className="ribbon-doubleButton">
                                <div className="ribbon-frameSelector">
                                    <div key="back" title="back frame" className="backKeyframe" onClick={e => { e.stopPropagation(); this.prevKeyframe(targetDoc, activeItem); }}>
                                        <FontAwesomeIcon icon={"caret-left"} size={"lg"} />
                                    </div>
                                    <div key="num" title="toggle view all" className="numKeyframe" style={{ color: targetDoc.editing ? "white" : "black", backgroundColor: targetDoc.editing ? "#5B9FDD" : "#AEDDF8" }}
                                        onClick={action(() => targetDoc.editing = !targetDoc.editing)} >
                                        {NumCast(targetDoc._currentFrame)}
                                    </div>
                                    <div key="fwd" title="forward frame" className="fwdKeyframe" onClick={e => { e.stopPropagation(); this.nextKeyframe(targetDoc, activeItem); }}>
                                        <FontAwesomeIcon icon={"caret-right"} size={"lg"} />
                                    </div>
                                </div>
                                <Tooltip title={<><div className="dash-tooltip">{"Last frame"}</div></>}><div className="ribbon-property">{NumCast(targetDoc.lastFrame)}</div></Tooltip>
                            </div>
                            <div className="ribbon-button" style={{ height: 20, backgroundColor: "#AEDDF8" }} onClick={() => console.log(" TODO: play frames")}>Play</div>
                        </div>
                    </div>
                </div>
            );
        }
    }

    @undoBatch
    @action
    switchActive = (color: ColorState) => {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        const val = String(color.hex);
        targetDoc["pres-text-color"] = val;
        return true;
    }
    @undoBatch
    @action
    switchPresented = (color: ColorState) => {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        const val = String(color.hex);
        targetDoc["pres-text-viewed-color"] = val;
        return true;
    }

    @computed get activeColorPicker() {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        return !this.openActiveColorPicker ? (null) : <SketchPicker onChange={this.switchActive}
            presetColors={['#D0021B', '#F5A623', '#F8E71C', '#8B572A', '#7ED321', '#417505',
                '#9013FE', '#4A90E2', '#50E3C2', '#B8E986', '#000000', '#4A4A4A', '#9B9B9B',
                '#FFFFFF', '#f1efeb', 'transparent']}
            color={StrCast(targetDoc["pres-text-color"])} />;
    }

    @computed get viewedColorPicker() {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        return !this.openViewedColorPicker ? (null) : <SketchPicker onChange={this.switchPresented}
            presetColors={['#D0021B', '#F5A623', '#F8E71C', '#8B572A', '#7ED321', '#417505',
                '#9013FE', '#4A90E2', '#50E3C2', '#B8E986', '#000000', '#4A4A4A', '#9B9B9B',
                '#FFFFFF', '#f1efeb', 'transparent']}
            color={StrCast(targetDoc["pres-text-viewed-color"])} />;
    }

    turnOffEdit = () => {
        this.childDocs.forEach((doc) => {
            doc.editSnapZoomProgressivize = false;
            doc.editZoomProgressivize = false;
            doc.editScrollProgressivize = false;
            const targetDoc = Cast(doc.presentationTargetDoc, Doc, null);
            if (targetDoc) {
                targetDoc.editZoomProgressivize = false;
                targetDoc.editScrollProgressivize = false;
            }
        });
    }

    //Toggle whether the user edits or not
    @action
    editZoomProgressivize = (e: React.MouseEvent) => {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        if (!targetDoc.editZoomProgressivize) {
            if (!activeItem.zoomProgressivize) activeItem.zoomProgressivize = true; targetDoc.zoomProgressivize = true;
            targetDoc.editZoomProgressivize = true;
            activeItem.editZoomProgressivize = true;
        } else {
            targetDoc.editZoomProgressivize = false;
            activeItem.editZoomProgressivize = false;
        }
    }

    //Toggle whether the user edits or not
    @action
    editScrollProgressivize = (e: React.MouseEvent) => {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        if (!targetDoc.editScrollProgressivize) {
            if (!targetDoc.scrollProgressivize) { targetDoc.scrollProgressivize = true; activeItem.scrollProgressivize = true; }
            targetDoc.editScrollProgressivize = true;
        } else {
            targetDoc.editScrollProgressivize = false;
        }
    }

    //Progressivize Zoom
    @action
    progressivizeScroll = (e: React.MouseEvent) => {
        e.stopPropagation();
        const activeItem: Doc = this.activeItem;
        activeItem.scrollProgressivize = !activeItem.scrollProgressivize;
        const targetDoc: Doc = this.targetDoc;
        targetDoc.scrollProgressivize = !targetDoc.scrollProgressivize;
        CollectionFreeFormDocumentView.setupScroll(targetDoc, NumCast(targetDoc._currentFrame));
        if (targetDoc.editScrollProgressivize) {
            targetDoc.editScrollProgressivize = false;
            targetDoc._currentFrame = 0;
            targetDoc.lastFrame = 0;
        }
    }

    //Progressivize Zoom
    @action
    progressivizeZoom = (e: React.MouseEvent) => {
        e.stopPropagation();
        const activeItem: Doc = this.activeItem;
        activeItem.zoomProgressivize = !activeItem.zoomProgressivize;
        const targetDoc: Doc = this.targetDoc;
        targetDoc.zoomProgressivize = !targetDoc.zoomProgressivize;
        CollectionFreeFormDocumentView.setupZoom(activeItem, targetDoc);
        if (activeItem.editZoomProgressivize) {
            activeItem.editZoomProgressivize = false;
            targetDoc._currentFrame = 0;
            targetDoc.lastFrame = 0;
        }
    }

    //Progressivize Child Docs
    @action
    editProgressivize = (e: React.MouseEvent) => {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        targetDoc._currentFrame = targetDoc.lastFrame;
        if (!targetDoc.editProgressivize) {
            if (!activeItem.presProgressivize) { activeItem.presProgressivize = true; targetDoc.presProgressivize = true; }
            targetDoc.editProgressivize = true;
        } else {
            targetDoc.editProgressivize = false;
        }
    }

    @action
    progressivizeChild = (e: React.MouseEvent) => {
        e.stopPropagation();
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        const docs = DocListCast(targetDoc[Doc.LayoutFieldKey(targetDoc)]);
        if (!activeItem.presProgressivize) {
            targetDoc.editing = false;
            activeItem.presProgressivize = true;
            targetDoc.presProgressivize = true;
            targetDoc._currentFrame = 0;
            docs.forEach((doc, i) => CollectionFreeFormDocumentView.setupKeyframes([doc], i, true));
            targetDoc.lastFrame = docs.length - 1;
        } else {
            targetDoc.editProgressivize = false;
            activeItem.presProgressivize = false;
            targetDoc.presProgressivize = false;
            targetDoc._currentFrame = 0;
            targetDoc.lastFrame = 0;
            targetDoc.editing = true;
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

    @action
    checkList = (doc: Doc, list: any): number => {
        const x: List<number> = list;
        if (x && x.length >= NumCast(doc._currentFrame) + 1) {
            return x[NumCast(doc._currentFrame)];
        } else if (x) {
            x.length = NumCast(doc._currentFrame) + 1;
            x[NumCast(doc._currentFrame)] = x[NumCast(doc._currentFrame) - 1];
            return x[NumCast(doc._currentFrame)];
        } else return 100;
    }

    @computed get progressivizeChildDocs() {
        const targetDoc: Doc = this.targetDoc;
        const docs = DocListCast(targetDoc[Doc.LayoutFieldKey(targetDoc)]);
        const tags: JSX.Element[] = [];
        docs.forEach((doc, index) => {
            if (doc["x-indexed"] && doc["y-indexed"]) {
                tags.push(<div style={{ position: 'absolute', display: doc.displayMovement ? "block" : "none" }}>{this.checkMovementLists(doc, doc["x-indexed"], doc["y-indexed"])}</div>);
            }
            tags.push(
                <div className="progressivizeButton" key={index} onPointerLeave={() => { if (NumCast(targetDoc._currentFrame) < NumCast(doc.appearFrame)) doc.opacity = 0; }} onPointerOver={() => { if (NumCast(targetDoc._currentFrame) < NumCast(doc.appearFrame)) doc.opacity = 0.5; }} onClick={e => { this.toggleDisplayMovement(doc); e.stopPropagation(); }} style={{ backgroundColor: doc.displayMovement ? "#aedff8" : "#c8c8c8", top: NumCast(doc.y), left: NumCast(doc.x) }}>
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
        // const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        // const targetDoc = Cast(activeItem?.presentationTargetDoc, Doc, null);
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
        // const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        // const targetDoc = Cast(activeItem?.presentationTargetDoc, Doc, null);
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

    @action
    toggleProperties = () => {
        if (CurrentUserUtils.propertiesWidth > 0) {
            CurrentUserUtils.propertiesWidth = 0;
        } else {
            CurrentUserUtils.propertiesWidth = 250;
        }
    }

    @computed get toolbar() {
        const propIcon = CurrentUserUtils.propertiesWidth > 0 ? "angle-double-right" : "angle-double-left";
        const propTitle = CurrentUserUtils.propertiesWidth > 0 ? "Close Presentation Panel" : "Open Presentation Panel";
        return (
            <div id="toolbarContainer" className={'presBox-toolbar'} style={{ display: this.layoutDoc.presStatus === "edit" ? "inline-flex" : "none" }}>
                <Tooltip title={<><div className="dash-tooltip">{"Add new slide"}</div></>}><div className={`toolbar-button ${this.newDocumentTools ? "active" : ""}`} onClick={action(() => this.newDocumentTools = !this.newDocumentTools)}>
                    <FontAwesomeIcon icon={"plus"} />
                    <FontAwesomeIcon className={`dropdown ${this.newDocumentTools ? "active" : ""}`} icon={"angle-down"} />
                </div></Tooltip>
                <div className="toolbar-divider" />
                <Tooltip title={<><div className="dash-tooltip">{"View paths"}</div></>}>
                    <div style={{ opacity: this.childDocs.length > 1 ? 1 : 0.3 }} className={`toolbar-button ${this.pathBoolean ? "active" : ""}`} onClick={this.childDocs.length > 1 ? this.viewPaths : undefined}>
                        <FontAwesomeIcon icon={"exchange-alt"} />
                    </div>
                </Tooltip>
                <Tooltip title={<><div className="dash-tooltip">{this.rootDoc.expandBoolean ? "Minimize all" : "Expand all"}</div></>}>
                    <div className={`toolbar-button ${this.rootDoc.expandBoolean ? "active" : ""}`} onClick={this.toggleExpandMode}>
                        <FontAwesomeIcon icon={"eye"} />
                    </div>
                </Tooltip>
                <div className="toolbar-divider" />
                <Tooltip title={<><div className="dash-tooltip">{propTitle}</div></>}>
                    <div className="toolbar-button" style={{ position: 'absolute', right: 4, fontSize: 16 }} onClick={this.toggleProperties}>
                        <FontAwesomeIcon className={"toolbar-thumbtack"} icon={propIcon} style={{ color: CurrentUserUtils.propertiesWidth > 0 ? '#AEDDF8' : 'white' }} />
                    </div>
                </Tooltip>
            </div>
        );
    }

    /**
     * Top panel containes:
     * viewPicker: The option to choose between List and Slides view for the presentaiton trail
     * presentPanel: The button to start the presentation / open minimized view of the presentation
     */
    @computed get topPanel() {
        const mode = StrCast(this.rootDoc._viewType) as CollectionViewType;
        return (
            <div className="presBox-buttons" style={{ display: this.rootDoc._chromeStatus === "disabled" ? "none" : undefined }}>
                <select className="presBox-viewPicker"
                    style={{ display: this.layoutDoc.presStatus === "edit" ? "block" : "none" }}
                    onPointerDown={e => e.stopPropagation()}
                    onChange={this.viewChanged}
                    value={mode}>
                    <option onPointerDown={e => e.stopPropagation()} value={CollectionViewType.Stacking}>List</option>
                    <option onPointerDown={e => e.stopPropagation()} value={CollectionViewType.Carousel}>Slides</option>
                </select>
                <div className="presBox-presentPanel" style={{ opacity: this.childDocs.length > 0 ? 1 : 0.3 }}>
                    <span className={`presBox-button ${this.layoutDoc.presStatus === "edit" ? "present" : ""}`}>
                        <div className="presBox-button-left" onClick={() => (this.childDocs.length > 0) && (this.layoutDoc.presStatus = "manual")}>
                            <FontAwesomeIcon icon={"play-circle"} />
                            <div style={{ display: this.props.PanelWidth() > 200 ? "inline-flex" : "none" }}>&nbsp; Present</div>
                        </div>
                        <div className={`presBox-button-right ${this.presentTools ? "active" : ""}`}
                            onClick={(action(() => {
                                if (this.childDocs.length > 0) this.presentTools = !this.presentTools;
                            }))}>
                            <FontAwesomeIcon className="dropdown" style={{ margin: 0, transform: this.presentTools ? 'rotate(180deg)' : 'rotate(0deg)' }} icon={"angle-down"} />
                            {this.presentDropdown}
                        </div>
                    </span>
                    {this.playButtons}
                </div>
            </div>
        );
    }

    @computed get playButtonFrames() {
        const targetDoc: Doc = this.targetDoc;
        return (
            <>
                {this.targetDoc ? <div className="miniPres-button-frame" style={{ display: targetDoc.lastFrame !== undefined && targetDoc.lastFrame >= 0 ? "inline-flex" : "none" }}>
                    <div>{targetDoc._currentFrame}</div>
                    <div className="miniPres-divider" style={{ border: 'solid 0.5px white', height: '60%' }}></div>
                    <div>{targetDoc.lastFrame}</div>
                </div> : null}
            </>
        );
    }

    @computed get playButtons() {
        // Case 1: There are still other frames and should go through all frames before going to next slide
        return (<div className="presPanelOverlay" style={{ display: this.layoutDoc.presStatus !== "edit" ? "inline-flex" : "none" }}>
            <Tooltip title={<><div className="dash-tooltip">{"Loop"}</div></>}><div className="presPanel-button" style={{ color: this.layoutDoc.presLoop ? '#AEDDF8' : 'white' }} onClick={() => this.layoutDoc.presLoop = !this.layoutDoc.presLoop}><FontAwesomeIcon icon={"redo-alt"} /></div></Tooltip>
            <div className="presPanel-divider"></div>
            <div className="presPanel-button" onClick={this.back}><FontAwesomeIcon icon={"arrow-left"} /></div>
            <Tooltip title={<><div className="dash-tooltip">{this.layoutDoc.presStatus === "auto" ? "Pause" : "Autoplay"}</div></>}><div className="presPanel-button" onClick={this.startOrPause}><FontAwesomeIcon icon={this.layoutDoc.presStatus === "auto" ? "pause" : "play"} /></div></Tooltip>
            <div className="presPanel-button" onClick={this.next}><FontAwesomeIcon icon={"arrow-right"} /></div>
            <div className="presPanel-divider"></div>
            <div className="presPanel-button-text" style={{ display: this.props.PanelWidth() > 250 ? "inline-flex" : "none" }}>
                Slide {this.itemIndex + 1} / {this.childDocs.length}
                {this.playButtonFrames}
            </div>
            <div className="presPanel-divider"></div>
            {this.props.PanelWidth() > 250 ? <div className="presPanel-button-text" onClick={() => this.layoutDoc.presStatus = "edit"}>EXIT</div>
                : <div className="presPanel-button" onClick={() => this.layoutDoc.presStatus = "edit"}>
                    <FontAwesomeIcon icon={"times"} />
                </div>}
        </div>);
    }

    @action
    startOrPause = () => {
        if (this.layoutDoc.presStatus === "manual") this.startAutoPres(this.itemIndex);
        else this.pauseAutoPres();
    }

    render() {
        // calling this method for keyEvents
        this.isPres;
        // needed to ensure that the childDocs are loaded for looking up fields
        this.childDocs.slice();
        const mode = StrCast(this.rootDoc._viewType) as CollectionViewType;
        return this.layoutDoc.inOverlay ?
            <div className="miniPres" style={{ width: 250, height: 35, background: '#323232', top: 0, zIndex: 3000000 }}>
                {<div className="miniPresOverlay">
                    <Tooltip title={<><div className="dash-tooltip">{"Loop"}</div></>}><div className="miniPres-button" style={{ color: this.layoutDoc.presLoop ? '#AEDDF8' : undefined }} onClick={() => this.layoutDoc.presLoop = !this.layoutDoc.presLoop}><FontAwesomeIcon icon={"redo-alt"} /></div></Tooltip>
                    <div className="miniPres-divider"></div>
                    <div className="miniPres-button" onClick={this.back}><FontAwesomeIcon icon={"arrow-left"} /></div>
                    <Tooltip title={<><div className="dash-tooltip">{this.layoutDoc.presStatus === "auto" ? "Pause" : "Autoplay"}</div></>}><div className="miniPres-button" onClick={this.startOrPause}><FontAwesomeIcon icon={this.layoutDoc.presStatus === "auto" ? "pause" : "play"} /></div></Tooltip>
                    <div className="miniPres-button" onClick={this.next}><FontAwesomeIcon icon={"arrow-right"} /></div>
                    <div className="miniPres-divider"></div>
                    <div className="miniPres-button-text">
                        Slide {this.itemIndex + 1} / {this.childDocs.length}
                        {this.playButtonFrames}
                    </div>
                    <div className="miniPres-divider"></div>
                    <div className="miniPres-button-text" onClick={this.updateMinimize}>EXIT</div>
                </div>}
            </div>
            :
            <div className="presBox-cont" style={{ minWidth: this.layoutDoc.inOverlay ? 240 : undefined }} >
                {this.topPanel}
                {this.toolbar}
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