import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "@material-ui/core";
import { action, computed, observable, runInAction, ObservableMap, IReactionDisposer, reaction } from "mobx";
import { observer } from "mobx-react";
import { ColorState, SketchPicker } from "react-color";
import { Doc, DocCastAsync, DocListCast, DocListCastAsync } from "../../../fields/Doc";
import { documentSchema } from "../../../fields/documentSchemas";
import { InkTool } from "../../../fields/InkField";
import { List } from "../../../fields/List";
import { PrefetchProxy } from "../../../fields/Proxy";
import { listSpec, makeInterface } from "../../../fields/Schema";
import { ScriptField } from "../../../fields/ScriptField";
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { returnFalse, returnOne, returnZero } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { DocumentType } from "../../documents/DocumentTypes";
import { CurrentUserUtils } from "../../util/CurrentUserUtils";
import { DocumentManager } from "../../util/DocumentManager";
import { Scripting } from "../../util/Scripting";
import { SelectionManager } from "../../util/SelectionManager";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionView, CollectionViewType } from "../collections/CollectionView";
import { TabDocView } from "../collections/TabDocView";
import { ViewBoxBaseComponent } from "../DocComponent";
import { AudioBox } from "./AudioBox";
import { CollectionFreeFormDocumentView } from "./CollectionFreeFormDocumentView";
import { FieldView, FieldViewProps } from './FieldView';
import "./PresBox.scss";

export enum PresMovement {
    Zoom = "zoom",
    Pan = "pan",
    Jump = "jump",
    None = "none",
}

export enum PresEffect {
    Fade = "Fade",
    Flip = "Flip",
    Rotate = "Rotate",
    Bounce = "Bounce",
    Roll = "Roll",
    None = "None",
}

enum PresStatus {
    Autoplay = "auto",
    Manual = "manual",
    Edit = "edit"
}

enum PresColors {
    LightBlue = "#AEDDF8",
    DarkBlue = "#5B9FDD",
    LightBackground = "#ececec",
    SlideBackground = "#d5dce2",
}

type PresBoxSchema = makeInterface<[typeof documentSchema]>;
const PresBoxDocument = makeInterface(documentSchema);

@observer
export class PresBox extends ViewBoxBaseComponent<FieldViewProps, PresBoxSchema>(PresBoxDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(PresBox, fieldKey); }

    @observable public static Instance: PresBox;

    @observable _isChildActive = false;
    @observable _moveOnFromAudio: boolean = true;
    @observable _presTimer!: NodeJS.Timeout;
    @observable _presKeyEventsActive: boolean = false;

    @observable _selectedArray: ObservableMap = new ObservableMap<Doc, any>();
    @observable _eleArray: HTMLElement[] = [];
    @observable _dragArray: HTMLElement[] = [];
    @observable _pathBoolean: boolean = false;
    @observable _expandBoolean: boolean = false;

    private _disposers: { [name: string]: IReactionDisposer } = {};
    @observable private transitionTools: boolean = false;
    @observable private newDocumentTools: boolean = false;
    @observable private progressivizeTools: boolean = false;
    @observable private openMovementDropdown: boolean = false;
    @observable private openEffectDropdown: boolean = false;
    @observable private presentTools: boolean = false;
    @computed get childDocs() { return DocListCast(this.dataDoc[this.fieldKey]); }
    @computed get tagDocs() {
        const tagDocs: Doc[] = [];
        for (const doc of this.childDocs) {
            const tagDoc = Cast(doc.presentationTargetDoc, Doc, null);
            tagDocs.push(tagDoc)
        }
        return tagDocs;
    }
    @computed get itemIndex() { return NumCast(this.rootDoc._itemIndex); }
    @computed get activeItem() { return Cast(this.childDocs[NumCast(this.rootDoc._itemIndex)], Doc, null); }
    @computed get targetDoc() { return Cast(this.activeItem?.presentationTargetDoc, Doc, null); }
    @computed get scrollable(): boolean {
        if (this.targetDoc.type === DocumentType.PDF || this.targetDoc.type === DocumentType.WEB || this.targetDoc.type === DocumentType.RTF || this.targetDoc._viewType === CollectionViewType.Stacking) return true;
        else return false;
    }
    @computed get panable(): boolean {
        if ((this.targetDoc.type === DocumentType.COL && this.targetDoc._viewType === CollectionViewType.Freeform) || this.targetDoc.type === DocumentType.IMG) return true;
        else return false;
    }
    @computed get presElement() { return Cast(Doc.UserDoc().presElement, Doc, null); }
    constructor(props: any) {
        super(props);
        if (Doc.UserDoc().activePresentation = this.rootDoc) runInAction(() => PresBox.Instance = this);
        if (!this.presElement) { // create exactly one presElmentBox template to use by any and all presentations.
            Doc.UserDoc().presElement = new PrefetchProxy(Docs.Create.PresElementBoxDocument({
                title: "pres element template", type: DocumentType.PRESELEMENT, backgroundColor: "transparent", _xMargin: 0, isTemplateDoc: true, isTemplateForField: "data"
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
        if (SelectionManager.SelectedDocuments().length) return SelectionManager.SelectedDocuments()[0];
        if (this._selectedArray.size) return DocumentManager.Instance.getDocumentView(this.rootDoc);
    }
    @computed get isPres(): boolean {
        document.removeEventListener("keydown", PresBox.keyEventsWrapper, true);
        if (this.selectedDoc?.type === DocumentType.PRES) {
            document.removeEventListener("keydown", PresBox.keyEventsWrapper, true);
            document.addEventListener("keydown", PresBox.keyEventsWrapper, true);
            return true;
        }
        return false;
    }
    @computed get selectedDoc() { return this.selectedDocumentView?.rootDoc; }

    @action
    componentWillUnmount() {
        document.removeEventListener("keydown", PresBox.keyEventsWrapper, true);
        this._presKeyEventsActive = false;
        this.resetPresentation();
        // Turn of progressivize editors
        this.turnOffEdit(true);
        Object.values(this._disposers).forEach(disposer => disposer?.());
    }

    @action
    componentDidMount() {
        this.rootDoc.presBox = this.rootDoc;
        this.rootDoc._forceRenderEngine = "timeline";
        this.rootDoc._replacedChrome = "replaced";
        this.layoutDoc.presStatus = PresStatus.Edit;
        this.layoutDoc._gridGap = 0;
        this.layoutDoc._yMargin = 0;
        document.removeEventListener("keydown", PresBox.keyEventsWrapper, true);
        document.addEventListener("keydown", PresBox.keyEventsWrapper, true);
        this._presKeyEventsActive = true;
        this.turnOffEdit(true);
        DocListCastAsync((Doc.UserDoc().myPresentations as Doc).data).then(pres =>
            !pres?.includes(this.rootDoc) && Doc.AddDocToList(Doc.UserDoc().myPresentations as Doc, "data", this.rootDoc));
        this._disposers.selection = reaction(() => SelectionManager.SelectedDocuments(),
            views => views.some(view => view.props.Document === this.rootDoc) && this.updateCurrentPresentation());
    }

    @action
    updateCurrentPresentation = (pres?: Doc) => {
        console.log('update current pres');
        if (pres) Doc.UserDoc().activePresentation = pres;
        else Doc.UserDoc().activePresentation = this.rootDoc;
        document.removeEventListener("keydown", PresBox.keyEventsWrapper, true);
        document.addEventListener("keydown", PresBox.keyEventsWrapper, true);
        PresBox.Instance = this;
    }

    // There are still other internal frames and should go through all frames before going to next slide
    nextInternalFrame = (targetDoc: Doc, activeItem: Doc) => {
        const currentFrame = Cast(targetDoc?._currentFrame, "number", null);
        const childDocs = DocListCast(targetDoc[Doc.LayoutFieldKey(targetDoc)]);
        targetDoc._viewTransition = "all 1s";
        setTimeout(() => targetDoc._viewTransition = undefined, 1010);
        this.nextKeyframe(targetDoc, activeItem);
        if (activeItem.presProgressivize) CollectionFreeFormDocumentView.updateKeyframe(childDocs, currentFrame || 0, targetDoc);
        else targetDoc.editing = true;
    }

    // 'Play on next' for audio or video therefore first navigate to the audio/video before it should be played
    nextAudioVideo = (targetDoc: Doc, activeItem: Doc) => {
        if (targetDoc.type === DocumentType.AUDIO) AudioBox.Instance.playFrom(NumCast(activeItem.presStartTime));
        // if (targetDoc.type === DocumentType.VID) { VideoBox.Instance.Play() };
        activeItem.playNow = false;
    }

    // No more frames in current doc and next slide is defined, therefore move to next slide 
    nextSlide = (targetDoc: Doc, activeNext: Doc) => {
        const nextSelected = this.itemIndex + 1;
        if (targetDoc.type === DocumentType.AUDIO) { if (AudioBox.Instance._ele) AudioBox.Instance.pause(); }
        // if (targetDoc.type === DocumentType.VID) { if (AudioBox.Instance._ele) VideoBox.Instance.Pause(); }
        const targetNext = Cast(activeNext.presentationTargetDoc, Doc, null);
        // If next slide is audio / video 'Play automatically' then the next slide should be played
        if (activeNext && (targetNext.type === DocumentType.AUDIO || targetNext.type === DocumentType.VID) && activeNext.playAuto) {
            console.log('play next automatically');
            if (targetNext.type === DocumentType.AUDIO) AudioBox.Instance.playFrom(NumCast(activeNext.presStartTime));
            // if (targetNext.type === DocumentType.VID) { VideoBox.Instance.Play() };
        } else if (targetNext.type === DocumentType.AUDIO || targetNext.type === DocumentType.VID) { activeNext.playNow = true; console.log('play next after it is navigated to'); }
        this.gotoDocument(nextSelected);
    }

    // Called when the user activates 'next' - to move to the next part of the pres. trail
    @action
    next = () => {
        console.log("--------------------------------");
        const activeNext = Cast(this.childDocs[this.itemIndex + 1], Doc, null);
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        const lastFrame = Cast(targetDoc?.lastFrame, "number", null);
        const curFrame = NumCast(targetDoc?._currentFrame);
        let internalFrames: boolean = false;
        if (activeItem.presProgressivize || activeItem.zoomProgressivize || targetDoc.scrollProgressivize) internalFrames = true;

        if (internalFrames && lastFrame !== undefined && curFrame < lastFrame) {
            // Case 1: There are still other frames and should go through all frames before going to next slide
            this.nextInternalFrame(targetDoc, activeItem);
        } else if ((targetDoc.type === DocumentType.AUDIO || targetDoc.type === DocumentType.VID) && !activeItem.playAuto && activeItem.playNow && this.layoutDoc.presStatus !== PresStatus.Autoplay) {
            // Case 2: 'Play on next' for audio or video therefore first navigate to the audio/video before it should be played
            this.nextAudioVideo(targetDoc, activeItem);
        } else if (this.childDocs[this.itemIndex + 1] !== undefined) {
            // Case 3: No more frames in current doc and next slide is defined, therefore move to next slide 
            this.nextSlide(targetDoc, activeNext);
        } else if (this.childDocs[this.itemIndex + 1] === undefined && this.layoutDoc.presLoop) {
            // Case 4: Last slide and presLoop is toggled ON
            this.gotoDocument(0);
        }
    }

    // Called when the user activates 'back' - to move to the previous part of the pres. trail
    @action
    back = () => {
        console.log("****************************");
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        const prevItem = Cast(this.childDocs[Math.max(0, this.itemIndex - 1)], Doc, null);
        const prevTargetDoc = Cast(prevItem.presentationTargetDoc, Doc, null);
        const lastFrame = Cast(targetDoc.lastFrame, "number", null);
        const curFrame = NumCast(targetDoc._currentFrame);
        if (lastFrame !== undefined && curFrame >= 1) {
            // Case 1: There are still other frames and should go through all frames before going to previous slide
            this.prevKeyframe(targetDoc, activeItem);
        } else if (activeItem) {
            let prevSelected = this.itemIndex;
            prevSelected = Math.max(0, prevSelected - 1);
            this.gotoDocument(prevSelected);
            if (NumCast(prevTargetDoc.lastFrame) > 0) prevTargetDoc._currentFrame = NumCast(prevTargetDoc.lastFrame);
        }
    }

    //The function that is called when a document is clicked or reached through next or back.
    //it'll also execute the necessary actions if presentation is playing.
    public gotoDocument = action((index: number) => {
        Doc.UnBrushAllDocs();
        if (index >= 0 && index < this.childDocs.length) {
            this.rootDoc._itemIndex = index;
            const activeItem: Doc = this.activeItem;
            const presTargetDoc = Cast(this.childDocs[this.itemIndex].presentationTargetDoc, Doc, null);
            if (activeItem.presPinView) {
                const bestTarget = DocumentManager.Instance.getFirstDocumentView(presTargetDoc)?.props.Document;
                bestTarget && runInAction(() => {
                    if (activeItem.presMovement === PresMovement.Jump) {
                        bestTarget._viewTransition = '0s';
                    } else {
                        bestTarget._viewTransition = activeItem.presTransition ? `transform ${activeItem.presTransition}ms` : 'all 1s';
                        setTimeout(() => bestTarget._viewTransition = undefined, activeItem.presTransition ? NumCast(activeItem.presTransition) + 10 : 1010);
                    }
                });
            } else if (presTargetDoc) {
                presTargetDoc && runInAction(() => {
                    if (activeItem.presMovement === PresMovement.Jump) presTargetDoc.focusSpeed = 0;
                    else presTargetDoc.focusSpeed = activeItem.presTransition ? activeItem.presTransition : 500;
                });
                setTimeout(() => presTargetDoc.focusSpeed = 500, this.activeItem.presTransition ? NumCast(this.activeItem.presTransition) + 10 : 510);
            }
            if (presTargetDoc?.lastFrame !== undefined) {
                presTargetDoc._currentFrame = 0;
            }
            this._selectedArray.clear();
            this.childDocs[index] && this._selectedArray.set(this.childDocs[index], undefined); //Update selected array
            if (this.layoutDoc._viewType === "stacking") this.navigateToElement(this.childDocs[index]); //Handles movement to element only when presTrail is list
            this.onHideDocument(); //Handles hide after/before
        }
    });


    navigateToView = (targetDoc: Doc, activeItem: Doc) => {
        const bestTarget = DocumentManager.Instance.getFirstDocumentView(targetDoc)?.props.Document;
        bestTarget && runInAction(() => {
            if (bestTarget.type === DocumentType.PDF || bestTarget.type === DocumentType.WEB || bestTarget.type === DocumentType.RTF || bestTarget._viewType === CollectionViewType.Stacking) {
                bestTarget._scrollY = activeItem.presPinViewScroll;
            } else if (bestTarget.type === DocumentType.COMPARISON) {
                bestTarget._clipWidth = activeItem.presPinClipWidth;
            } else if (bestTarget.type === DocumentType.VID) {
                bestTarget._currentTimecode = activeItem.presPinTimecode;
            } else {
                bestTarget._viewTransition = activeItem.presTransition ? `transform ${activeItem.presTransition}ms` : 'all 0.5s';
                bestTarget._panX = activeItem.presPinViewX;
                bestTarget._panY = activeItem.presPinViewY;
                bestTarget._viewScale = activeItem.presPinViewScale;
            }
        });
        setTimeout(() => targetDoc._viewTransition = undefined, 1010);
    }

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
        const srcContext = await DocCastAsync(targetDoc?.context);
        const presCollection = Cast(this.layoutDoc.presCollection, Doc, null);
        const collectionDocView = presCollection ? DocumentManager.Instance.getDocumentView(presCollection) : undefined;
        this.turnOffEdit();
        if (this.itemIndex >= 0) {
            if (srcContext && targetDoc) {
                this.layoutDoc.presCollection = srcContext;
            } else if (targetDoc) this.layoutDoc.presCollection = targetDoc;
        }
        const docToJump = curDoc;
        const willZoom = false;
        const presStatus = this.rootDoc.presStatus;
        const selViewCache = Array.from(this._selectedArray.keys());
        const dragViewCache = Array.from(this._dragArray);
        const eleViewCache = Array.from(this._eleArray);
        const self = this;
        const resetSelection = action(() => {
            const presDocView = DocumentManager.Instance.getDocumentView(self.rootDoc);
            if (presDocView) SelectionManager.SelectDoc(presDocView, false);
            self.rootDoc.presStatus = presStatus;
            self._selectedArray.clear();
            selViewCache.forEach(doc => self._selectedArray.set(doc, undefined));
            self._dragArray.splice(0, self._dragArray.length, ...dragViewCache);
            self._eleArray.splice(0, self._eleArray.length, ...eleViewCache);
        });
        const openInTab = () => {
            collectionDocView ? collectionDocView.props.addDocTab(targetDoc, "") : this.props.addDocTab(targetDoc, ":left");
            this.layoutDoc.presCollection = targetDoc;
            // this still needs some fixing
            setTimeout(resetSelection, 500);
        };
        // If openDocument is selected then it should open the document for the user
        if (activeItem.openDocument) {
            openInTab();
        } else {
            if (docToJump === curDoc) {
                //checking if curDoc has navigation open
                if (curDoc.presMovement === PresMovement.Pan && targetDoc) {
                    await DocumentManager.Instance.jumpToDocument(targetDoc, false, openInTab, srcContext); // documents open in new tab instead of on right
                } else if ((curDoc.presMovement === PresMovement.Zoom || curDoc.presMovement === PresMovement.Jump) && targetDoc) {
                    //awaiting jump so that new scale can be found, since jumping is async
                    await DocumentManager.Instance.jumpToDocument(targetDoc, true, openInTab, srcContext, undefined, undefined, undefined, resetSelection); // documents open in new tab instead of on right
                }
            } else {
                //awaiting jump so that new scale can be found, since jumping is async
                targetDoc && await DocumentManager.Instance.jumpToDocument(targetDoc, willZoom, undefined, srcContext);
            }
        }
        // After navigating to the document, if it is added as a presPinView then it will
        // adjust the pan and scale to that of the pinView when it was added.
        if (activeItem.presPinView) {
            // if targetDoc is not displayed but one of its aliases is, then we need to modify that alias, not the original target
            this.navigateToView(targetDoc, activeItem);
        }
        // TODO: Add progressivize for navigating web (storing websites for given frames)
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
            const itemIndexes: number[] = this.getAllIndexes(this.tagDocs, tagDoc);
            const curInd: number = itemIndexes.indexOf(index);
            if (itemIndexes.length > 1 && curDoc.presHideBefore && curInd !== 0) { }
            else if (curDoc.presHideBefore) {
                if (index > this.itemIndex) {
                    tagDoc.opacity = 0;
                } else if (!curDoc.presHideAfter) {
                    tagDoc.opacity = 1;
                }
            }
            if (itemIndexes.length > 1 && curDoc.presHideAfter && curInd !== (itemIndexes.length - 1)) { }
            else if (curDoc.presHideAfter) {
                if (index < this.itemIndex) {
                    tagDoc.opacity = 0;
                } else if (!curDoc.presHideBefore) {
                    tagDoc.opacity = 1;
                }
            }
        });
    }



    //The function that starts or resets presentaton functionally, depending on presStatus of the layoutDoc
    @action
    startAutoPres = (startSlide: number) => {
        this.updateCurrentPresentation();
        let activeItem: Doc = this.activeItem;
        let targetDoc: Doc = this.targetDoc;
        let duration = NumCast(activeItem.presDuration) + NumCast(activeItem.presTransition);
        const timer = (ms: number) => new Promise(res => this._presTimer = setTimeout(res, ms));
        const load = async () => { // Wrap the loop into an async function for this to work
            for (var i = startSlide; i < this.childDocs.length; i++) {
                activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
                targetDoc = Cast(activeItem.presentationTargetDoc, Doc, null);
                duration = NumCast(activeItem.presDuration) + NumCast(activeItem.presTransition);
                if (duration < 100) { duration = 2500; }
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
                        if (this.layoutDoc.presStatus === 'auto' && !this.layoutDoc.presLoop) this.layoutDoc.presStatus = PresStatus.Manual;
                        else if (this.layoutDoc.presLoop) this.startAutoPres(0);
                    }, duration);
                }
            }
        };
        this.layoutDoc.presStatus = PresStatus.Autoplay;
        this.startPresentation(startSlide);
        this.gotoDocument(startSlide);
        load();
    }

    @action
    pauseAutoPres = () => {
        if (this.layoutDoc.presStatus === PresStatus.Autoplay) {
            if (this._presTimer) clearTimeout(this._presTimer);
            this.layoutDoc.presStatus = PresStatus.Manual;
            this.layoutDoc.presLoop = false;
        }
    }

    //The function that resets the presentation by removing every action done by it. It also
    //stops the presentaton.
    resetPresentation = () => {
        this.rootDoc._itemIndex = 0;
        for (const doc of this.childDocs) Cast(doc.presentationTargetDoc, Doc, null).opacity = 1;
    }

    @action togglePath = (srcContext: Doc, off?: boolean) => {
        if (off) {
            this._pathBoolean = false;
            srcContext.presPathView = false;
        } else {
            runInAction(() => this._pathBoolean = !this._pathBoolean);
            srcContext.presPathView = this._pathBoolean;
        }
    }

    @action toggleExpandMode = () => {
        runInAction(() => this._expandBoolean = !this._expandBoolean);
        this.rootDoc.expandBoolean = this._expandBoolean;
        this.childDocs.forEach((doc) => {
            doc.presExpandInlineButton = this._expandBoolean;
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
            if (doc.presHideBefore && this.childDocs.indexOf(doc) > startIndex) {
                tagDoc.opacity = 0;
            }
            if (doc.presHideAfter && this.childDocs.indexOf(doc) < startIndex) {
                tagDoc.opacity = 0;
            }
        });
    }

    /**
     * The method called to open the presentation as a minimized view
     */
    @action
    updateMinimize = () => {
        const docView = DocumentManager.Instance.getDocumentView(this.layoutDoc);
        if (CurrentUserUtils.OverlayDocs.includes(this.layoutDoc)) {
            this.layoutDoc.presStatus = PresStatus.Edit;
            Doc.RemoveDocFromList((Doc.UserDoc().myOverlayDocs as Doc), undefined, this.rootDoc);
            CollectionDockingView.AddSplit(this.rootDoc, "right");
        } else if (this.layoutDoc.context && docView) {
            this.layoutDoc.presStatus = PresStatus.Edit;
            clearTimeout(this._presTimer);
            const pt = this.props.ScreenToLocalTransform().inverse().transformPoint(0, 0);
            this.rootDoc.x = pt[0] + (this.props.PanelWidth() - 250);
            this.rootDoc.y = pt[1] + 10;
            this.rootDoc._height = 35;
            this.rootDoc._width = 250;
            docView.props.removeDocument?.(this.layoutDoc);
            Doc.AddDocToList((Doc.UserDoc().myOverlayDocs as Doc), undefined, this.rootDoc);
        } else {
            this.layoutDoc.presStatus = PresStatus.Edit;
            clearTimeout(this._presTimer);
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
    // @undoBatch
    viewChanged = action((e: React.ChangeEvent) => {
        //@ts-ignore
        const viewType = e.target.selectedOptions[0].value as CollectionViewType;
        // pivot field may be set by the user in timeline view (or some other way) -- need to reset it here
        viewType === CollectionViewType.Stacking && (this.rootDoc._pivotField = undefined);
        this.rootDoc._viewType = viewType;
        if (viewType === CollectionViewType.Stacking) this.layoutDoc._gridGap = 0;
    });


    setMovementName = action((movement: any, activeItem: Doc): string => {
        let output: string = 'none';
        switch (movement) {
            case PresMovement.Zoom: output = 'Pan & Zoom'; break; //Pan and zoom
            case PresMovement.Pan: output = 'Pan'; break; //Pan
            case PresMovement.Jump: output = 'Jump cut'; break; //Jump Cut
            case PresMovement.None: output = 'None'; break; //None
            default: output = 'Zoom'; activeItem.presMovement = 'zoom'; break; //default set as zoom
        }
        return output;
    });

    whenActiveChanged = action((isActive: boolean) => this.props.whenActiveChanged(this._isChildActive = isActive));
    // For dragging documents into the presentation trail
    addDocumentFilter = (doc: Doc | Doc[]) => {
        const docs = doc instanceof Doc ? [doc] : doc;
        docs.forEach((doc, i) => {
            if (doc.type === DocumentType.LABEL) {
                const audio = Cast(doc.annotationOn, Doc, null);
                if (audio) {
                    audio.presStartTime = NumCast(doc.audioStart);
                    audio.presEndTime = NumCast(doc.audioEnd);
                    audio.presDuration = NumCast(doc.audioEnd) - NumCast(doc.audioStart);
                    TabDocView.PinDoc(audio, false, true);
                    setTimeout(() => this.removeDocument(doc), 0);
                    return false;
                }
            } else {
                if (!doc.aliasOf) {
                    const original = Doc.MakeAlias(doc);
                    TabDocView.PinDoc(original);
                    setTimeout(() => this.removeDocument(doc), 0);
                    return false;
                } else {
                    if (!doc.presentationTargetDoc) doc.title = doc.title + " - Slide";
                    doc.aliasOf instanceof Doc && (doc.presentationTargetDoc = doc.aliasOf);
                    doc.presMovement = PresMovement.Zoom;
                    if (this._expandBoolean) doc.presExpandInlineButton = true;
                }
            }
        });
        return true;
    }
    childLayoutTemplate = () => this.rootDoc._viewType !== CollectionViewType.Stacking ? undefined : this.presElement;
    removeDocument = (doc: Doc) => Doc.RemoveDocFromList(this.dataDoc, this.fieldKey, doc);
    getTransform = () => this.props.ScreenToLocalTransform().translate(-5, -65);// listBox padding-left and pres-box-cont minHeight
    panelHeight = () => this.props.PanelHeight() - 40;
    active = (outsideReaction?: boolean) => ((Doc.GetSelectedTool() === InkTool.None && !this.layoutDoc._isBackground) &&
        (this.layoutDoc.forceActive || this.props.isSelected(outsideReaction) || this._isChildActive || this.props.renderDepth === 0) ? true : false)

    /**
     * For sorting the array so that the order is maintained when it is dropped.
     */
    @action
    sortArray = (): Doc[] => {
        return this.childDocs.filter(doc => this._selectedArray.has(doc));
    }

    /**
     * Method to get the list of selected items in the order in which they have been selected
     */
    @computed get listOfSelected() {
        const list = Array.from(this._selectedArray.keys()).map((doc: Doc, index: any) => {
            const curDoc = Cast(doc, Doc, null);
            const tagDoc = Cast(curDoc.presentationTargetDoc!, Doc, null);
            if (curDoc && curDoc === this.activeItem) return <div className="selectedList-items"><b>{index + 1}.  {curDoc.title}</b></div>
            else if (tagDoc) return <div className="selectedList-items">{index + 1}.  {curDoc.title}</div>;
            else if (curDoc) return <div className="selectedList-items">{index + 1}.  {curDoc.title}</div>;
        });
        return list;
    }

    @action
    selectPres = (pres?: Doc) => {
        const presDocView = DocumentManager.Instance.getDocumentView(pres ? pres : this.rootDoc)!;
        SelectionManager.SelectDoc(presDocView, false);
    }

    //Regular click
    @action
    selectElement = (doc: Doc) => {
        console.log("~~~~~~~~~~~~~~~~~~~~~~~~~");
        const context = Cast(doc.context, Doc, null);
        this.gotoDocument(this.childDocs.indexOf(doc));
        if (doc.presPinView || doc.presentationTargetDoc === this.layoutDoc.presCollection) setTimeout(() => this.updateCurrentPresentation(context), 0);
        else this.updateCurrentPresentation(context);
    }

    //Command click
    @action
    multiSelect = (doc: Doc, ref: HTMLElement, drag: HTMLElement) => {
        if (!this._selectedArray.has(doc)) {
            this._selectedArray.set(doc, undefined);
            this._eleArray.push(ref);
            this._dragArray.push(drag);
        }
        this.selectPres();
    }

    //Shift click
    @action
    shiftSelect = (doc: Doc, ref: HTMLElement, drag: HTMLElement) => {
        this._selectedArray.clear();
        // const activeItem = Cast(this.childDocs[this.itemIndex], Doc, null);
        if (this.activeItem) {
            for (let i = Math.min(this.itemIndex, this.childDocs.indexOf(doc)); i <= Math.max(this.itemIndex, this.childDocs.indexOf(doc)); i++) {
                this._selectedArray.set(this.childDocs[i], undefined);
                this._eleArray.push(ref);
                this._dragArray.push(drag);
            }
        }
        this.selectPres();
    }

    //regular click
    @action
    regularSelect = (doc: Doc, ref: HTMLElement, drag: HTMLElement, focus: boolean) => {
        this._selectedArray.clear();
        this._selectedArray.set(doc, undefined);
        this._eleArray.splice(0, this._eleArray.length, ref);
        this._dragArray.splice(0, this._dragArray.length, drag);
        focus && this.selectElement(doc);
        this.selectPres();
    }

    modifierSelect = (doc: Doc, ref: HTMLElement, drag: HTMLElement, focus: boolean, cmdClick: boolean, shiftClick: boolean) => {
        if (cmdClick) this.multiSelect(doc, ref, drag);
        else if (shiftClick) this.shiftSelect(doc, ref, drag);
        else this.regularSelect(doc, ref, drag, focus);
    }

    static keyEventsWrapper = (e: KeyboardEvent) => {
        PresBox.Instance.keyEvents(e);
    }

    // Key for when the presentaiton is active
    @action
    keyEvents = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement) return;
        let handled = false;
        const anchorNode = document.activeElement as HTMLDivElement;
        if (anchorNode && anchorNode.className?.includes("lm_title")) return;
        switch (e.key) {
            case "Backspace":
                if (this.layoutDoc.presStatus === "edit") {
                    undoBatch(action(() => {
                        for (const doc of Array.from(this._selectedArray.keys())) {
                            this.removeDocument(doc);
                        }
                        this._selectedArray.clear();
                        this._eleArray.length = 0;
                        this._dragArray.length = 0;
                    }))();
                    handled = true;
                }
                break;
            case "Escape":
                if (CurrentUserUtils.OverlayDocs.includes(this.layoutDoc)) { this.updateMinimize(); }
                else if (this.layoutDoc.presStatus === "edit") { this._selectedArray.clear(); this._eleArray.length = this._dragArray.length = 0; }
                else this.layoutDoc.presStatus = "edit";
                if (this._presTimer) clearTimeout(this._presTimer);
                handled = true;
                break;
            case "Down": case "ArrowDown":
            case "Right": case "ArrowRight":
                if (this.itemIndex >= this.childDocs.length - 1) return;
                if (e.shiftKey) { // TODO: update to work properly
                    this.rootDoc._itemIndex = NumCast(this.rootDoc._itemIndex) + 1;
                    this._selectedArray.set(this.childDocs[this.rootDoc._itemIndex], undefined);
                } else {
                    this.next();
                    if (this._presTimer) { clearTimeout(this._presTimer); this.layoutDoc.presStatus = PresStatus.Manual; }
                }
                handled = true;
                break;
            case "Up": case "ArrowUp":
            case "Left": case "ArrowLeft":
                if (this.itemIndex === 0) return;
                if (e.shiftKey) { // TODO: update to work properly
                    this.rootDoc._itemIndex = NumCast(this.rootDoc._itemIndex) - 1;
                    this._selectedArray.set(this.childDocs[this.rootDoc._itemIndex], undefined);
                } else {
                    this.back();
                    if (this._presTimer) { clearTimeout(this._presTimer); this.layoutDoc.presStatus = PresStatus.Manual; }
                }
                handled = true;
                break;
            case "Spacebar": case " ":
                if (this.layoutDoc.presStatus === PresStatus.Manual) this.startAutoPres(this.itemIndex);
                else if (this.layoutDoc.presStatus === PresStatus.Autoplay) if (this._presTimer) clearTimeout(this._presTimer);
                handled = true;
                break;
            case "a":
                if ((e.metaKey || e.altKey) && this.layoutDoc.presStatus === "edit") {
                    this._selectedArray.clear();
                    this.childDocs.forEach(doc => this._selectedArray.set(doc, undefined));
                    handled = true;
                }
            default:
                break;
        }
        if (handled) {
            e.stopPropagation();
            e.preventDefault();
        }
    }

    /**
     * 
     */
    @action
    viewPaths = () => {
        const srcContext = Cast(this.rootDoc.presCollection, Doc, null);
        if (srcContext) {
            this.togglePath(srcContext);
        }
    }

    getAllIndexes = (arr: Doc[], val: Doc): number[] => {
        var indexes = [], i;
        for (i = 0; i < arr.length; i++)
            if (arr[i] === val)
                indexes.push(i);
        return indexes;
    }

    // Adds the index in the pres path graphically
    @computed get order() {
        const order: JSX.Element[] = [];
        const docs: Doc[] = [];
        this.childDocs.filter(doc => Cast(doc.presentationTargetDoc, Doc, null)).forEach((doc, index) => {
            const tagDoc = Cast(doc.presentationTargetDoc, Doc, null);
            const srcContext = Cast(tagDoc.context, Doc, null);
            const width = NumCast(tagDoc._width) / 10;
            const height = Math.max(NumCast(tagDoc._height) / 10, 15);
            const edge = Math.max(width, height);
            const fontSize = edge * 0.8;
            const gap = 2;
            // Case A: Document is contained within the collection
            if (this.rootDoc.presCollection === srcContext) {
                if (docs.includes(tagDoc)) {
                    const prevOccurances: number = this.getAllIndexes(docs, tagDoc).length;
                    docs.push(tagDoc);
                    order.push(
                        <div className="pathOrder"
                            key={tagDoc.id + 'pres' + index}
                            style={{ top: NumCast(tagDoc.y) + (prevOccurances * (edge + gap) - (edge / 2)), left: NumCast(tagDoc.x) - (edge / 2), width: edge, height: edge, fontSize: fontSize }}
                            onClick={() => this.selectElement(doc)}>
                            <div className="pathOrder-frame">{index + 1}</div>
                        </div>);
                } else {
                    docs.push(tagDoc);
                    order.push(
                        <div className="pathOrder"
                            key={tagDoc.id + 'pres' + index}
                            style={{ top: NumCast(tagDoc.y) - (edge / 2), left: NumCast(tagDoc.x) - (edge / 2), width: edge, height: edge, fontSize: fontSize }}
                            onClick={() => this.selectElement(doc)}>
                            <div className="pathOrder-frame">{index + 1}</div>
                        </div>);
                }
                // Case B: Document is presPinView and is presCollection
            } else if (doc.pinWithView && this.layoutDoc.presCollection === tagDoc) {
                docs.push(tagDoc);
                order.push(
                    <div className="pathOrder" key={tagDoc.id + 'pres' + index} style={{ top: 0, left: 0 }}>
                        <div className="pathOrder-frame">{index + 1}</div>
                    </div>);
                // Case C: Document is not contained within presCollection
            } else {
                docs.push(tagDoc);
                order.push(
                    <div className="pathOrder" key={tagDoc.id + 'pres' + index} style={{ position: 'absolute', top: 0, left: 0 }}>
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
                boxShadow: '0px 4px 4px rgba(0, 0, 0, 0.25)',
            }}
            fill="none"
            markerStart="url(#markerArrow)"
            markerMid="url(#markerSquare)"
            markerEnd="url(#markerSquareFilled)"
        />);
    }

    // Converts seconds to ms and updates presTransition
    setTransitionTime = (number: String, change?: number) => {
        let timeInMS = Number(number) * 1000;
        if (change) timeInMS += change;
        if (timeInMS < 100) timeInMS = 100;
        if (timeInMS > 10000) timeInMS = 10000;
        Array.from(this._selectedArray.keys()).forEach((doc) => doc.presTransition = timeInMS);
    }

    // Converts seconds to ms and updates presDuration
    setDurationTime = (number: String, change?: number) => {
        let timeInMS = Number(number) * 1000;
        if (change) timeInMS += change;
        if (timeInMS < 100) timeInMS = 100;
        if (timeInMS > 20000) timeInMS = 20000;
        Array.from(this._selectedArray.keys()).forEach((doc) => doc.presDuration = timeInMS);
    }

    /**
     * When the movement dropdown is changes
     */
    @undoBatch
    updateMovement = action((movement: any, all?: boolean) => {
        const array: any[] = all ? this.childDocs : Array.from(this._selectedArray.keys());
        array.forEach((doc) => {
            switch (movement) {
                case PresMovement.Zoom: //Pan and zoom
                    doc.presMovement = PresMovement.Zoom;
                    break;
                case PresMovement.Pan: //Pan
                    doc.presMovement = PresMovement.Pan;
                    break;
                case PresMovement.Jump: //Jump Cut
                    doc.presJump = true;
                    doc.presMovement = PresMovement.Jump;
                    break;
                case PresMovement.None: default:
                    doc.presMovement = PresMovement.None;
                    break;
            }
        })
    });

    @undoBatch
    @action
    updateHideBefore = (activeItem: Doc) => {
        activeItem.presHideBefore = !activeItem.presHideBefore;
        Array.from(this._selectedArray.keys()).forEach((doc) => doc.presHideBefore = activeItem.presHideBefore);
    }

    @undoBatch
    @action
    updateHideAfter = (activeItem: Doc) => {
        activeItem.presHideAfter = !activeItem.presHideAfter;
        Array.from(this._selectedArray.keys()).forEach((doc) => doc.presHideAfter = activeItem.presHideAfter);
    }

    @undoBatch
    @action
    updateOpenDoc = (activeItem: Doc) => {
        activeItem.openDocument = !activeItem.openDocument;
        Array.from(this._selectedArray.keys()).forEach((doc) => {
            doc.openDocument = activeItem.openDocument;
        });
    }

    @undoBatch
    @action
    updateEffect = (effect: any, all?: boolean) => {
        const array: any[] = all ? this.childDocs : Array.from(this._selectedArray.keys());
        array.forEach((doc) => {
            const tagDoc = Cast(doc.presentationTargetDoc, Doc, null);
            switch (effect) {
                case PresEffect.Bounce:
                    tagDoc.presEffect = PresEffect.Bounce;
                    break;
                case PresEffect.Fade:
                    tagDoc.presEffect = PresEffect.Fade;
                    break;
                case PresEffect.Flip:
                    tagDoc.presEffect = PresEffect.Flip;
                    break;
                case PresEffect.Roll:
                    tagDoc.presEffect = PresEffect.Roll;
                    break;
                case PresEffect.Rotate:
                    tagDoc.presEffect = PresEffect.Rotate;
                    break;
                case PresEffect.None: default:
                    tagDoc.presEffect = PresEffect.None;
                    break;
            }
        });
    }

    _batch: UndoManager.Batch | undefined = undefined;

    @computed get transitionDropdown() {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        if (activeItem && targetDoc) {
            const transitionSpeed = activeItem.presTransition ? NumCast(activeItem.presTransition) / 1000 : 0.5;
            let duration = activeItem.presDuration ? NumCast(activeItem.presDuration) / 1000 : 2;
            if (activeItem.type === DocumentType.AUDIO) duration = NumCast(activeItem.duration);
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
                                <div className={`presBox-dropdownOption ${activeItem.presMovement === PresMovement.None ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateMovement(PresMovement.None)}>None</div>
                                <div className={`presBox-dropdownOption ${activeItem.presMovement === PresMovement.Zoom ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateMovement(PresMovement.Zoom)}>Pan {"&"} Zoom</div>
                                <div className={`presBox-dropdownOption ${activeItem.presMovement === PresMovement.Pan ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateMovement(PresMovement.Pan)}>Pan</div>
                                <div className={`presBox-dropdownOption ${activeItem.presMovement === PresMovement.Jump ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateMovement(PresMovement.Jump)}>Jump cut</div>
                            </div>
                        </div>
                        <div className="ribbon-doubleButton" style={{ display: activeItem.presMovement === PresMovement.Pan || activeItem.presMovement === PresMovement.Zoom ? "inline-flex" : "none" }}>
                            <div className="presBox-subheading">Transition Speed</div>
                            <div className="ribbon-property">
                                <input className="presBox-input"
                                    type="number" value={transitionSpeed}
                                    onChange={action((e) => this.setTransitionTime(e.target.value))} /> s
                            </div>
                            <div className="ribbon-propertyUpDown">
                                <div className="ribbon-propertyUpDownItem" onClick={undoBatch(() => this.setTransitionTime(String(transitionSpeed), 1000))}>
                                    <FontAwesomeIcon icon={"caret-up"} />
                                </div>
                                <div className="ribbon-propertyUpDownItem" onClick={undoBatch(() => this.setTransitionTime(String(transitionSpeed), -1000))}>
                                    <FontAwesomeIcon icon={"caret-down"} />
                                </div>
                            </div>
                        </div>
                        <input type="range" step="0.1" min="0.1" max="10" value={transitionSpeed}
                            className={`toolbar-slider ${activeItem.presMovement === PresMovement.Pan || activeItem.presMovement === PresMovement.Zoom ? "" : "none"}`}
                            id="toolbar-slider"
                            onPointerDown={() => this._batch = UndoManager.StartBatch("presTransition")}
                            onPointerUp={() => this._batch?.end()}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                e.stopPropagation();
                                this.setTransitionTime(e.target.value);
                            }} />
                        <div className={`slider-headers ${activeItem.presMovement === PresMovement.Pan || activeItem.presMovement === PresMovement.Zoom ? "" : "none"}`}>
                            <div className="slider-text">Fast</div>
                            <div className="slider-text">Medium</div>
                            <div className="slider-text">Slow</div>
                        </div>
                    </div>
                    <div className="ribbon-box">
                        Visibility {"&"} Duration
                        <div className="ribbon-doubleButton">
                            <Tooltip title={<><div className="dash-tooltip">{"Hide before presented"}</div></>}><div className={`ribbon-toggle ${activeItem.presHideBefore ? "active" : ""}`} onClick={() => this.updateHideBefore(activeItem)}>Hide before</div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Hide after presented"}</div></>}><div className={`ribbon-toggle ${activeItem.presHideAfter ? "active" : ""}`} onClick={() => this.updateHideAfter(activeItem)}>Hide after</div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Open document in a new tab"}</div></>}><div className="ribbon-toggle" style={{ backgroundColor: activeItem.openDocument ? "#aedef8" : "" }} onClick={() => this.updateOpenDoc(activeItem)}>Open</div></Tooltip>
                        </div>
                        <div className="ribbon-doubleButton" >
                            <div className="presBox-subheading">Slide Duration</div>
                            <div className="ribbon-property">
                                <input className="presBox-input"
                                    type="number" value={duration}
                                    onChange={action((e) => this.setDurationTime(e.target.value))} /> s
                            </div>
                            <div className="ribbon-propertyUpDown">
                                <div className="ribbon-propertyUpDownItem" onClick={undoBatch(() => this.setDurationTime(String(duration), 1000))}>
                                    <FontAwesomeIcon icon={"caret-up"} />
                                </div>
                                <div className="ribbon-propertyUpDownItem" onClick={undoBatch(() => this.setDurationTime(String(duration), -1000))}>
                                    <FontAwesomeIcon icon={"caret-down"} />
                                </div>
                            </div>
                        </div>
                        <input type="range" step="0.1" min="0.1" max="20" value={duration}
                            style={{ display: targetDoc.type === DocumentType.AUDIO ? "none" : "block" }}
                            className={"toolbar-slider"} id="duration-slider"
                            onPointerDown={() => { this._batch = UndoManager.StartBatch("presDuration"); }}
                            onPointerUp={() => { if (this._batch) this._batch.end(); }}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { e.stopPropagation(); this.setDurationTime(e.target.value); }}
                        />
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
                                <div className={'presBox-dropdownOption'} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateEffect(PresEffect.None)}>None</div>
                                <div className={'presBox-dropdownOption'} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateEffect(PresEffect.Fade)}>Fade In</div>
                                <div className={'presBox-dropdownOption'} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateEffect(PresEffect.Flip)}>Flip</div>
                                <div className={'presBox-dropdownOption'} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateEffect(PresEffect.Rotate)}>Rotate</div>
                                <div className={'presBox-dropdownOption'} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateEffect(PresEffect.Bounce)}>Bounce</div>
                                <div className={'presBox-dropdownOption'} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateEffect(PresEffect.Roll)}>Roll</div>
                            </div>
                        </div>
                        <div className="ribbon-doubleButton" style={{ display: effect === 'None' ? "none" : "inline-flex" }}>
                            <div className="presBox-subheading" >Effect direction</div>
                            <div className="ribbon-property">
                                {this.effectDirection}
                            </div>
                        </div>
                        <div className="effectDirection" style={{ display: effect === 'None' ? "none" : "grid", width: 40 }}>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from left"}</div></>}><div style={{ gridColumn: 1, gridRow: 2, justifySelf: 'center', color: targetDoc.presEffectDirection === "left" ? "#5a9edd" : "black", cursor: "pointer" }} onClick={undoBatch(() => targetDoc.presEffectDirection = 'left')}><FontAwesomeIcon icon={"angle-right"} /></div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from right"}</div></>}><div style={{ gridColumn: 3, gridRow: 2, justifySelf: 'center', color: targetDoc.presEffectDirection === "right" ? "#5a9edd" : "black", cursor: "pointer" }} onClick={undoBatch(() => targetDoc.presEffectDirection = 'right')}><FontAwesomeIcon icon={"angle-left"} /></div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from top"}</div></>}><div style={{ gridColumn: 2, gridRow: 1, justifySelf: 'center', color: targetDoc.presEffectDirection === "top" ? "#5a9edd" : "black", cursor: "pointer" }} onClick={undoBatch(() => targetDoc.presEffectDirection = 'top')}><FontAwesomeIcon icon={"angle-down"} /></div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from bottom"}</div></>}><div style={{ gridColumn: 2, gridRow: 3, justifySelf: 'center', color: targetDoc.presEffectDirection === "bottom" ? "#5a9edd" : "black", cursor: "pointer" }} onClick={undoBatch(() => targetDoc.presEffectDirection = 'bottom')}><FontAwesomeIcon icon={"angle-up"} /></div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from center"}</div></>}><div style={{ gridColumn: 2, gridRow: 2, width: 10, height: 10, alignSelf: 'center', justifySelf: 'center', border: targetDoc.presEffectDirection ? "solid 2px black" : "solid 2px #5a9edd", borderRadius: "100%", cursor: "pointer" }} onClick={undoBatch(() => targetDoc.presEffectDirection = false)}></div></Tooltip>
                        </div>
                    </div>
                    <div className="ribbon-final-box">
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
        this.updateMovement(activeItem.presMovement, true);
        this.updateEffect(targetDoc.presEffect, true);
        array.forEach((doc) => {
            const curDoc = Cast(doc, Doc, null);
            const tagDoc = Cast(curDoc.presentationTargetDoc, Doc, null);
            if (tagDoc && targetDoc) {
                curDoc.presTransition = activeItem.presTransition;
                curDoc.presDuration = activeItem.presDuration;
                tagDoc.presEffectDirection = targetDoc.presEffectDirection;
                curDoc.presHideBefore = activeItem.presHideBefore;
                curDoc.presHideAfter = activeItem.presHideAfter;
            }
        });
    }
    @computed get optionsDropdown() {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        const presPinWithViewIcon = <img src="/assets/pinWithView.png" style={{ margin: "auto", width: 16, filter: 'invert(1)' }} />;
        if (activeItem && targetDoc) {
            return (
                <div>
                    <div className={'presBox-ribbon'} onClick={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                        <div className="ribbon-box">
                            <div className="ribbon-doubleButton" style={{ display: targetDoc.type === DocumentType.AUDIO ? "inline-flex" : "none" }}>
                                <div className="ribbon-toggle" style={{ backgroundColor: activeItem.playAuto ? "#aedef8" : "" }} onClick={() => activeItem.playAuto = !activeItem.playAuto}>Play automatically</div>
                                <div className="ribbon-toggle" style={{ display: "flex", backgroundColor: activeItem.playAuto ? "" : "#aedef8" }} onClick={() => activeItem.playAuto = !activeItem.playAuto}>Play on next</div>
                            </div>
                            {/* {targetDoc.type === DocumentType.VID ? <div className="ribbon-toggle" style={{ backgroundColor: activeItem.presVidFullScreen ? "#aedef8" : "" }} onClick={() => activeItem.presVidFullScreen = !activeItem.presVidFullScreen}>Full screen</div> : (null)} */}
                            {targetDoc.type === DocumentType.AUDIO ? <div className="ribbon-doubleButton" style={{ marginRight: 10 }}>
                                <div className="presBox-subheading">Start time</div>
                                <div className="ribbon-property" style={{ paddingRight: 0, paddingLeft: 0 }}>
                                    <input className="presBox-input"
                                        style={{ textAlign: 'left', width: 50 }}
                                        type="number" value={NumCast(activeItem.presStartTime)}
                                        onChange={action((e: React.ChangeEvent<HTMLInputElement>) => { activeItem.presStartTime = Number(e.target.value); })} />
                                </div>
                            </div> : (null)}
                            {targetDoc.type === DocumentType.AUDIO ? <div className="ribbon-doubleButton" style={{ marginRight: 10 }}>
                                <div className="presBox-subheading">End time</div>
                                <div className="ribbon-property" style={{ paddingRight: 0, paddingLeft: 0 }}>
                                    <input className="presBox-input"
                                        style={{ textAlign: 'left', width: 50 }}
                                        type="number" value={NumCast(activeItem.presEndTime)}
                                        onChange={action((e: React.ChangeEvent<HTMLInputElement>) => { const val = e.target.value; activeItem.presEndTime = Number(val); })} />
                                </div>
                            </div> : (null)}
                            {this.panable || this.scrollable || this.targetDoc.type === DocumentType.COMPARISON ? 'Pinned view' : (null)}
                            <div className="ribbon-doubleButton">
                                <Tooltip title={<><div className="dash-tooltip">{activeItem.presPinView ? "Turn off pin with view" : "Turn on pin with view"}</div></>}><div className="ribbon-toggle" style={{ width: 20, padding: 0, backgroundColor: activeItem.presPinView ? PresColors.LightBlue : "" }}
                                    onClick={() => {
                                        activeItem.presPinView = !activeItem.presPinView;
                                        targetDoc.presPinView = activeItem.presPinView;
                                        if (activeItem.presPinView) {
                                            if (targetDoc.type === DocumentType.PDF || targetDoc.type === DocumentType.RTF || targetDoc.type === DocumentType.WEB || targetDoc._viewType === CollectionViewType.Stacking) {
                                                const scroll = targetDoc._scrollTop;
                                                activeItem.presPinView = true;
                                                activeItem.presPinViewScroll = scroll;
                                            } else if (targetDoc.type === DocumentType.VID) {
                                                activeItem.presPinTimecode = targetDoc._currentTimecode;
                                            } else if ((targetDoc.type === DocumentType.COL && targetDoc._viewType === CollectionViewType.Freeform) || targetDoc.type === DocumentType.IMG) {
                                                const x = targetDoc._panX;
                                                const y = targetDoc._panY;
                                                const scale = targetDoc._viewScale;
                                                activeItem.presPinView = true;
                                                activeItem.presPinViewX = x;
                                                activeItem.presPinViewY = y;
                                                activeItem.presPinViewScale = scale;
                                            } else if (targetDoc.type === DocumentType.COMPARISON) {
                                                const width = targetDoc._clipWidth;
                                                activeItem.presPinClipWidth = width;
                                                activeItem.presPinView = true;
                                            }
                                        }
                                    }}>{presPinWithViewIcon}</div></Tooltip>
                                {activeItem.presPinView ? <Tooltip title={<><div className="dash-tooltip">{"Update the pinned view with the view of the selected document"}</div></>}><div className="ribbon-button"
                                    onClick={() => {
                                        if (targetDoc.type === DocumentType.PDF || targetDoc.type === DocumentType.WEB || targetDoc.type === DocumentType.RTF) {
                                            const scroll = targetDoc._scrollTop;
                                            activeItem.presPinViewScroll = scroll;
                                        } else if (targetDoc.type === DocumentType.VID) {
                                            activeItem.presPinTimecode = targetDoc._currentTimecode;
                                        } else if (targetDoc.type === DocumentType.COMPARISON) {
                                            const clipWidth = targetDoc._clipWidth;
                                            activeItem.presPinClipWidth = clipWidth;
                                        } else {
                                            const x = targetDoc._panX;
                                            const y = targetDoc._panY;
                                            const scale = targetDoc._viewScale;
                                            activeItem.presPinViewX = x;
                                            activeItem.presPinViewY = y;
                                            activeItem.presPinViewScale = scale;
                                        }
                                    }}>Update</div></Tooltip> : (null)}
                            </div>
                            {this.panable ? <div style={{ display: activeItem.presPinView ? "block" : "none" }}>
                                <div className="ribbon-doubleButton" style={{ marginRight: 10 }}>
                                    <div className="presBox-subheading">Pan X</div>
                                    <div className="ribbon-property" style={{ paddingRight: 0, paddingLeft: 0 }}>
                                        <input className="presBox-input"
                                            style={{ textAlign: 'left', width: 50 }}
                                            type="number" value={NumCast(activeItem.presPinViewX)}
                                            onChange={action((e: React.ChangeEvent<HTMLInputElement>) => { const val = e.target.value; activeItem.presPinViewX = Number(val); })} />
                                    </div>
                                </div>
                                <div className="ribbon-doubleButton" style={{ marginRight: 10 }}>
                                    <div className="presBox-subheading">Pan Y</div>
                                    <div className="ribbon-property" style={{ paddingRight: 0, paddingLeft: 0 }}>
                                        <input className="presBox-input"
                                            style={{ textAlign: 'left', width: 50 }}
                                            type="number" value={NumCast(activeItem.presPinViewY)}
                                            onChange={action((e: React.ChangeEvent<HTMLInputElement>) => { const val = e.target.value; activeItem.presPinViewY = Number(val); })} />
                                    </div>
                                </div>
                                <div className="ribbon-doubleButton" style={{ marginRight: 10 }}>
                                    <div className="presBox-subheading">Scale</div>
                                    <div className="ribbon-property" style={{ paddingRight: 0, paddingLeft: 0 }}>
                                        <input className="presBox-input"
                                            style={{ textAlign: 'left', width: 50 }}
                                            type="number" value={NumCast(activeItem.presPinViewScale)}
                                            onChange={action((e: React.ChangeEvent<HTMLInputElement>) => { const val = e.target.value; activeItem.presPinViewScale = Number(val); })} />
                                    </div>
                                </div>
                            </div> : (null)}
                            {this.scrollable ? <div style={{ display: activeItem.presPinView ? "block" : "none" }}>
                                <div className="ribbon-doubleButton" style={{ marginRight: 10 }}>
                                    <div className="presBox-subheading">Scroll</div>
                                    <div className="ribbon-property" style={{ paddingRight: 0, paddingLeft: 0 }}>
                                        <input className="presBox-input"
                                            style={{ textAlign: 'left', width: 50 }}
                                            type="number" value={NumCast(activeItem.presPinViewScroll)}
                                            onChange={action((e: React.ChangeEvent<HTMLInputElement>) => { const val = e.target.value; activeItem.presPinViewScroll = Number(val); })} />
                                    </div>
                                </div>
                            </div> : (null)}
                            {/* <div className="ribbon-doubleButton" style={{ display: targetDoc.type === DocumentType.WEB ? "inline-flex" : "none" }}>
                                <div className="ribbon-toggle" onClick={this.progressivizeText}>Store original website</div>
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
                            onChange={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                runInAction(() => this.title = e.target.value);
                            }}>
                        </input>
                    </div>
                    <div className="ribbon-box">
                        Choose type:
                        <div className="ribbon-doubleButton">
                            <div title="Text" className={'ribbon-toggle'} style={{ background: this.addFreeform ? "" : "#aedef8" }} onClick={action(() => this.addFreeform = !this.addFreeform)}>Text</div>
                            <div title="Freeform" className={'ribbon-toggle'} style={{ background: this.addFreeform ? "#aedef8" : "" }} onClick={action(() => this.addFreeform = !this.addFreeform)}>Freeform</div>
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
                TabDocView.PinDoc(doc, false);
                this.gotoDocument(this.childDocs.length);
            } else {
                this.props.addDocTab(doc, "add:right");
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
                <div className="dropdown-play-button" onClick={undoBatch(action(() => { this.updateMinimize(); this.turnOffEdit(true); }))}>
                    Minimize
                </div>
                <div className="dropdown-play-button" onClick={undoBatch(action(() => { this.layoutDoc.presStatus = "manual"; this.turnOffEdit(true); }))}>
                    Sidebar view
                </div>
            </div>
        );
    }

    // Case in which the document has keyframes to navigate to next key frame
    @action
    nextKeyframe = (tagDoc: Doc, curDoc: Doc): void => {
        const childDocs = DocListCast(tagDoc[Doc.LayoutFieldKey(tagDoc)]);
        const currentFrame = Cast(tagDoc._currentFrame, "number", null);
        if (currentFrame === undefined) {
            tagDoc._currentFrame = 0;
            // CollectionFreeFormDocumentView.setupScroll(tagDoc, 0);
            // CollectionFreeFormDocumentView.setupKeyframes(childDocs, 0);
        }
        // if (tagDoc.editScrollProgressivize) CollectionFreeFormDocumentView.updateScrollframe(tagDoc, currentFrame);
        CollectionFreeFormDocumentView.updateKeyframe(childDocs, currentFrame || 0, tagDoc);
        tagDoc._currentFrame = Math.max(0, (currentFrame || 0) + 1);
        tagDoc.lastFrame = Math.max(NumCast(tagDoc._currentFrame), NumCast(tagDoc.lastFrame));
    }

    @action
    prevKeyframe = (tagDoc: Doc, actItem: Doc): void => {
        const childDocs = DocListCast(tagDoc[Doc.LayoutFieldKey(tagDoc)]);
        const currentFrame = Cast(tagDoc._currentFrame, "number", null);
        if (currentFrame === undefined) {
            tagDoc._currentFrame = 0;
            // CollectionFreeFormDocumentView.setupKeyframes(childDocs, 0);
        }
        CollectionFreeFormDocumentView.gotoKeyframe(childDocs.slice());
        tagDoc._currentFrame = Math.max(0, (currentFrame || 0) - 1);
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
                        {/* <div className="ribbon-box">
                            {this.stringType} selected
                            <div className="ribbon-doubleButton" style={{ borderTop: 'solid 1px darkgrey', display: (targetDoc.type === DocumentType.COL && targetDoc._viewType === 'freeform') || targetDoc.type === DocumentType.IMG || targetDoc.type === DocumentType.RTF ? "inline-flex" : "none" }}>
                                <div className="ribbon-toggle" style={{ backgroundColor: activeItem.presProgressivize ? "#aedef8" : "" }} onClick={this.progressivizeChild}>Contents</div>
                                <div className="ribbon-toggle" style={{ opacity: activeItem.presProgressivize ? 1 : 0.4, backgroundColor: targetDoc.editProgressivize ? "#aedef8" : "" }} onClick={this.editProgressivize}>Edit</div>
                            </div>
                            <div className="ribbon-doubleButton" style={{ display: activeItem.presProgressivize ? "inline-flex" : "none" }}>
                                <div className="presBox-subheading">Active text color</div>
                                <div className="ribbon-colorBox" style={{ backgroundColor: activeFontColor, height: 15, width: 15 }} onClick={action(() => { this.openActiveColorPicker = !this.openActiveColorPicker; })}>
                                </div>
                            </div>
                            {this.activeColorPicker}
                            <div className="ribbon-doubleButton" style={{ display: activeItem.presProgressivize ? "inline-flex" : "none" }}>
                                <div className="presBox-subheading">Viewed font color</div>
                                <div className="ribbon-colorBox" style={{ backgroundColor: viewedFontColor, height: 15, width: 15 }} onClick={action(() => this.openViewedColorPicker = !this.openViewedColorPicker)}>
                                </div>
                            </div>
                            {this.viewedColorPicker}
                            <div className="ribbon-doubleButton" style={{ borderTop: 'solid 1px darkgrey', display: (targetDoc.type === DocumentType.COL && targetDoc._viewType === 'freeform') || targetDoc.type === DocumentType.IMG ? "inline-flex" : "none" }}>
                                <div className="ribbon-toggle" style={{ backgroundColor: activeItem.zoomProgressivize ? "#aedef8" : "" }} onClick={this.progressivizeZoom}>Zoom</div>
                                <div className="ribbon-toggle" style={{ opacity: activeItem.zoomProgressivize ? 1 : 0.4, backgroundColor: activeItem.editZoomProgressivize ? "#aedef8" : "" }} onClick={this.editZoomProgressivize}>Edit</div>
                            </div>
                            <div className="ribbon-doubleButton" style={{ borderTop: 'solid 1px darkgrey', display: targetDoc._viewType === "stacking" || targetDoc.type === DocumentType.PDF || targetDoc.type === DocumentType.WEB || targetDoc.type === DocumentType.RTF ? "inline-flex" : "none" }}>
                                <div className="ribbon-toggle" style={{ backgroundColor: activeItem.scrollProgressivize ? "#aedef8" : "" }} onClick={this.progressivizeScroll}>Scroll</div>
                                <div className="ribbon-toggle" style={{ opacity: activeItem.scrollProgressivize ? 1 : 0.4, backgroundColor: targetDoc.editScrollProgressivize ? "#aedef8" : "" }} onClick={this.editScrollProgressivize}>Edit</div>
                            </div>
                        </div> */}
                        <div className="ribbon-final-box">
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
                            <div className="ribbon-frameList">
                                {this.frameListHeader}
                                {this.frameList}
                            </div>
                            <div className="ribbon-toggle" style={{ height: 20, backgroundColor: "#AEDDF8" }} onClick={() => console.log(" TODO: play frames")}>Play</div>
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

    @action
    turnOffEdit = (paths?: boolean) => {
        if (paths) {
            // Turn off paths
            const srcContext = Cast(this.rootDoc.presCollection, Doc, null);
            if (srcContext) this.togglePath(srcContext, true);
        }
        // Turn off the progressivize editors for each
        this.childDocs.forEach((doc) => {
            doc.editSnapZoomProgressivize = false;
            doc.editZoomProgressivize = false;
            const targetDoc = Cast(doc.presentationTargetDoc, Doc, null);
            if (targetDoc) {
                targetDoc.editZoomProgressivize = false;
                // targetDoc.editScrollProgressivize = false;
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
        // CollectionFreeFormDocumentView.setupScroll(targetDoc, NumCast(targetDoc._currentFrame));
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
            targetDoc.lastFrame = targetDoc.lastFrame ? NumCast(targetDoc.lastFrame) : docs.length - 1;
        } else {
            // targetDoc.editProgressivize = false;
            activeItem.presProgressivize = false;
            targetDoc.presProgressivize = false;
            targetDoc._currentFrame = 0;
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
        const mode = StrCast(this.rootDoc._viewType) as CollectionViewType;
        const isMini: boolean = this.toolbarWidth <= 100;
        const presKeyEvents: boolean = (this.isPres && this._presKeyEventsActive && this.rootDoc === Doc.UserDoc().activePresentation);
        return (mode === CollectionViewType.Carousel3D) ? (null) : (
            <div id="toolbarContainer" className={'presBox-toolbar'}>
                {/* <Tooltip title={<><div className="dash-tooltip">{"Add new slide"}</div></>}><div className={`toolbar-button ${this.newDocumentTools ? "active" : ""}`} onClick={action(() => this.newDocumentTools = !this.newDocumentTools)}>
                    <FontAwesomeIcon icon={"plus"} />
                    <FontAwesomeIcon className={`dropdown ${this.newDocumentTools ? "active" : ""}`} icon={"angle-down"} />
                </div></Tooltip> */}
                <Tooltip title={<><div className="dash-tooltip">{"View paths"}</div></>}>
                    <div style={{ opacity: this.childDocs.length > 1 ? 1 : 0.3, color: this._pathBoolean ? PresColors.DarkBlue : 'white', width: isMini ? "100%" : undefined }} className={"toolbar-button"} onClick={this.childDocs.length > 1 ? this.viewPaths : undefined}>
                        <FontAwesomeIcon icon={"exchange-alt"} />
                    </div>
                </Tooltip>
                {isMini ? (null) :
                    <>
                        <div className="toolbar-divider" />
                        <Tooltip title={<><div className="dash-tooltip">{this._expandBoolean ? "Minimize all" : "Expand all"}</div></>}>
                            <div className={"toolbar-button"}
                                style={{ color: this._expandBoolean ? PresColors.DarkBlue : 'white' }}
                                onClick={this.toggleExpandMode}>
                                {/* <FontAwesomeIcon icon={this.rootDoc.expandBoolean ? "eye-slash" : "eye"} /> */}
                                <FontAwesomeIcon icon={"eye"} />
                            </div>
                        </Tooltip>
                        <div className="toolbar-divider" />
                        <Tooltip title={<><div className="dash-tooltip">{presKeyEvents ? "Keys are active" : "Keys are not active - click anywhere on the presentation trail to activate keys"}</div></>}>
                            <div className="toolbar-button" style={{ cursor: presKeyEvents ? 'default' : 'pointer', position: 'absolute', right: 30, fontSize: 16 }}>
                                <FontAwesomeIcon className={"toolbar-thumbtack"} icon={"keyboard"} style={{ color: presKeyEvents ? PresColors.DarkBlue : 'white' }} />
                            </div>
                        </Tooltip>
                        <Tooltip title={<><div className="dash-tooltip">{propTitle}</div></>}>
                            <div className="toolbar-button" style={{ position: 'absolute', right: 4, fontSize: 16 }} onClick={this.toggleProperties}>
                                <FontAwesomeIcon className={"toolbar-thumbtack"} icon={propIcon} style={{ color: CurrentUserUtils.propertiesWidth > 0 ? PresColors.DarkBlue : 'white' }} />
                            </div>
                        </Tooltip>
                    </>
                }
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
        const isMini: boolean = this.toolbarWidth <= 100;
        return (
            <div className="presBox-buttons" style={{ display: this.rootDoc._chromeStatus === "disabled" ? "none" : undefined }}>
                {isMini ? (null) : <select className="presBox-viewPicker"
                    style={{ display: this.layoutDoc.presStatus === "edit" ? "block" : "none" }}
                    onPointerDown={e => e.stopPropagation()}
                    onChange={this.viewChanged}
                    value={mode}>
                    <option onPointerDown={e => e.stopPropagation()} value={CollectionViewType.Stacking}>List</option>
                    <option onPointerDown={e => e.stopPropagation()} value={CollectionViewType.Carousel3D}>3D Carousel</option>
                </select>}
                <div className="presBox-presentPanel" style={{ opacity: this.childDocs.length ? 1 : 0.3 }}>
                    <span className={`presBox-button ${this.layoutDoc.presStatus === "edit" ? "present" : ""}`}>
                        <div className="presBox-button-left" onClick={undoBatch(() => (this.childDocs.length) && (this.layoutDoc.presStatus = "manual"))}>
                            <FontAwesomeIcon icon={"play-circle"} />
                            <div style={{ display: this.props.PanelWidth() > 200 ? "inline-flex" : "none" }}>&nbsp; Present</div>
                        </div>
                        {(mode === CollectionViewType.Carousel3D || isMini) ? (null) : <div className={`presBox-button-right ${this.presentTools ? "active" : ""}`}
                            onClick={(action(() => {
                                if (this.childDocs.length) this.presentTools = !this.presentTools;
                            }))}>
                            <FontAwesomeIcon className="dropdown" style={{ margin: 0, transform: this.presentTools ? 'rotate(180deg)' : 'rotate(0deg)' }} icon={"angle-down"} />
                            {this.presentDropdown}
                        </div>}
                    </span>
                    {this.playButtons}
                </div>
            </div>
        );
    }

    @action
    getList = (list: any): List<number> => {
        const x: List<number> = list;
        return x;
    }

    @action
    updateList = (list: any): List<number> => {
        const targetDoc: Doc = this.targetDoc;
        const x: List<number> = list;
        x.length + 1;
        x[x.length - 1] = NumCast(targetDoc._scrollY);
        return x;
    }

    @action
    newFrame = () => {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        const type: string = StrCast(targetDoc.type);
        if (!activeItem.frameList) activeItem.frameList = new List<number>();
        switch (type) {
            case (DocumentType.PDF || DocumentType.RTF || DocumentType.WEB):
                this.updateList(activeItem.frameList);
                break;
            case DocumentType.COL:
                break;
            default:
                break;
        }
    }

    @computed get frameListHeader() {
        return (<div className="frameList-header">
            &nbsp; Frames {this.panable ? <i>Panable</i> : this.scrollable ? <i>Scrollable</i> : (null)}
            <div className={"frameList-headerButtons"}>
                <Tooltip title={<><div className="dash-tooltip">{"Add frame by example"}</div></>}><div className={"headerButton"} onClick={e => { e.stopPropagation(); this.newFrame(); }}>
                    <FontAwesomeIcon icon={"plus"} onPointerDown={e => e.stopPropagation()} />
                </div></Tooltip>
                <Tooltip title={<><div className="dash-tooltip">{"Edit in collection"}</div></>}><div className={"headerButton"} onClick={e => { e.stopPropagation(); console.log('New frame'); }}>
                    <FontAwesomeIcon icon={"edit"} onPointerDown={e => e.stopPropagation()} />
                </div></Tooltip>
            </div>
        </div>);
    }

    @computed get frameList() {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        const frameList: List<number> = this.getList(activeItem.frameList);
        if (frameList) {
            const frameItems = frameList.map((value) =>
                <div className="framList-item">

                </div>
            );
            return (

                <div className="frameList-container">
                    {frameItems}
                </div>
            );
        } else return (null);

    }

    @computed get playButtonFrames() {
        const targetDoc: Doc = this.targetDoc;
        return (
            <>
                {this.targetDoc ? <div className="presPanel-button-frame" style={{ display: targetDoc.lastFrame !== undefined && targetDoc.lastFrame >= 0 ? "inline-flex" : "none" }}>
                    <div>{targetDoc._currentFrame}</div>
                    <div className="presPanel-divider" style={{ border: 'solid 0.5px white', height: '60%' }}></div>
                    <div>{targetDoc.lastFrame}</div>
                </div> : null}
            </>
        );
    }

    @computed get playButtons() {
        // Case 1: There are still other frames and should go through all frames before going to next slide
        return (<div className="presPanelOverlay" style={{ display: this.layoutDoc.presStatus !== "edit" ? "inline-flex" : "none" }}>
            <Tooltip title={<><div className="dash-tooltip">{"Loop"}</div></>}><div className="presPanel-button" style={{ color: this.layoutDoc.presLoop ? PresColors.DarkBlue : 'white' }} onClick={() => this.layoutDoc.presLoop = !this.layoutDoc.presLoop}><FontAwesomeIcon icon={"redo-alt"} /></div></Tooltip>
            <div className="presPanel-divider"></div>
            <div className="presPanel-button" onClick={() => { this.back(); if (this._presTimer) { clearTimeout(this._presTimer); this.layoutDoc.presStatus = PresStatus.Manual; } }}><FontAwesomeIcon icon={"arrow-left"} /></div>
            <Tooltip title={<><div className="dash-tooltip">{this.layoutDoc.presStatus === PresStatus.Autoplay ? "Pause" : "Autoplay"}</div></>}><div className="presPanel-button" onClick={this.startOrPause}><FontAwesomeIcon icon={this.layoutDoc.presStatus === PresStatus.Autoplay ? "pause" : "play"} /></div></Tooltip>
            <div className="presPanel-button" onClick={() => { this.next(); if (this._presTimer) { clearTimeout(this._presTimer); this.layoutDoc.presStatus = PresStatus.Manual; } }}><FontAwesomeIcon icon={"arrow-right"} /></div>
            <div className="presPanel-divider"></div>
            <div className="presPanel-button-text" style={{ display: this.props.PanelWidth() > 250 ? "inline-flex" : "none" }}>
                Slide {this.itemIndex + 1} / {this.childDocs.length}
                {this.playButtonFrames}
            </div>
            <div className="presPanel-divider"></div>
            {this.props.PanelWidth() > 250 ? <div className="presPanel-button-text" onClick={undoBatch(action(() => { this.layoutDoc.presStatus = "edit"; clearTimeout(this._presTimer); }))}>EXIT</div>
                : <div className="presPanel-button" onClick={undoBatch(action(() => this.layoutDoc.presStatus = "edit"))}>
                    <FontAwesomeIcon icon={"times"} />
                </div>}
        </div>);
    }

    @action
    startOrPause = () => {
        if (this.layoutDoc.presStatus === PresStatus.Manual || this.layoutDoc.presStatus === PresStatus.Edit) this.startAutoPres(this.itemIndex);
        else this.pauseAutoPres();
    }

    render() {
        // calling this method for keyEvents
        this.isPres;
        // needed to ensure that the childDocs are loaded for looking up fields
        this.childDocs.slice();
        const mode = StrCast(this.rootDoc._viewType) as CollectionViewType;
        const presKeyEvents: boolean = (this.isPres && this._presKeyEventsActive && this.rootDoc === Doc.UserDoc().activePresentation);
        return CurrentUserUtils.OverlayDocs.includes(this.rootDoc) ?
            <div className="miniPres">
                <div className="presPanelOverlay" style={{ display: "inline-flex", height: 30, background: '#323232', top: 0, zIndex: 3000000, boxShadow: presKeyEvents ? '0 0 0px 3px ' + PresColors.DarkBlue : undefined }}>
                    <Tooltip title={<><div className="dash-tooltip">{"Loop"}</div></>}><div className="presPanel-button" style={{ color: this.layoutDoc.presLoop ? PresColors.DarkBlue : undefined }} onClick={() => this.layoutDoc.presLoop = !this.layoutDoc.presLoop}><FontAwesomeIcon icon={"redo-alt"} /></div></Tooltip>
                    <div className="presPanel-divider"></div>
                    <div className="presPanel-button" onClick={() => { this.back(); if (this._presTimer) { clearTimeout(this._presTimer); this.layoutDoc.presStatus = PresStatus.Manual; } }}><FontAwesomeIcon icon={"arrow-left"} /></div>
                    <Tooltip title={<><div className="dash-tooltip">{this.layoutDoc.presStatus === PresStatus.Autoplay ? "Pause" : "Autoplay"}</div></>}><div className="presPanel-button" onClick={this.startOrPause}><FontAwesomeIcon icon={this.layoutDoc.presStatus === "auto" ? "pause" : "play"} /></div></Tooltip>
                    <div className="presPanel-button" onClick={() => { this.next(); if (this._presTimer) { clearTimeout(this._presTimer); this.layoutDoc.presStatus = PresStatus.Manual; } }}><FontAwesomeIcon icon={"arrow-right"} /></div>
                    <div className="presPanel-divider"></div>
                    <div className="presPanel-button-text">
                        Slide {this.itemIndex + 1} / {this.childDocs.length}
                        {this.playButtonFrames}
                    </div>
                    <div className="presPanel-divider"></div>
                    <div className="presPanel-button-text" onClick={undoBatch(action(() => { this.updateMinimize(); this.layoutDoc.presStatus = PresStatus.Edit; clearTimeout(this._presTimer); }))}>EXIT</div>
                </div>
            </div>
            :
            <div className="presBox-cont" style={{ minWidth: CurrentUserUtils.OverlayDocs.includes(this.layoutDoc) ? 240 : undefined }} >
                {this.topPanel}
                {this.toolbar}
                {this.newDocumentToolbarDropdown}
                <div className="presBox-listCont">
                    {mode !== CollectionViewType.Invalid ?
                        <CollectionView {...this.props}
                            ContainingCollectionDoc={this.props.Document}
                            PanelWidth={this.props.PanelWidth}
                            PanelHeight={this.panelHeight}
                            childIgnoreNativeSize={true}
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
    if (field === 'presCollapsedHeight') return container._viewType === CollectionViewType.Stacking ? 35 : 31;
    if (field === 'presStatus') return container.presStatus;
    if (field === '_itemIndex') return container._itemIndex;
    if (field === 'presBox') return container;
    return undefined;
});