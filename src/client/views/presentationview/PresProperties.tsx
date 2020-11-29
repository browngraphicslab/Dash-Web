import React from "react";
import { action, computed, observable, reaction } from "mobx";
import { Doc } from "../../../fields/Doc";
import { BoolCast, Cast, NumCast } from "../../../fields/Types";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { PresBox, PresColor, PresEffect, PresMovement } from "../nodes/PresBox";
import { DocumentType } from "../../documents/DocumentTypes";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CollectionViewType } from "../collections/CollectionView";
import { Tooltip } from "@material-ui/core";


export class PresProperties {

    @observable public static Instance: PresProperties;

    @computed get pres(): PresBox { return PresBox.Instance; }

    @computed get activeItem() { return Cast(this.pres.childDocs[NumCast(PresBox.Instance.rootDoc._itemIndex)], Doc, null); }
    @computed get targetDoc() { return Cast(this.pres.activeItem?.presentationTargetDoc, Doc, null); }

    @computed get scrollable(): boolean {
        if (this.targetDoc.type === DocumentType.PDF || this.targetDoc.type === DocumentType.WEB || this.targetDoc.type === DocumentType.RTF || this.targetDoc._viewType === CollectionViewType.Stacking) return true;
        else return false;
    }
    @computed get panable(): boolean {
        if ((this.targetDoc.type === DocumentType.COL && this.targetDoc._viewType === CollectionViewType.Freeform) || this.targetDoc.type === DocumentType.IMG) return true;
        else return false;
    }


    @observable private openMovementDropdown: boolean = false;
    @observable private openEffectDropdown: boolean = false;

    _batch: UndoManager.Batch | undefined = undefined;


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
    updateHideBefore = (activeItem: Doc) => {
        activeItem.presHideBefore = !activeItem.presHideBefore;
        Array.from(this.pres._selectedArray.keys()).forEach((doc) => doc.presHideBefore = activeItem.presHideBefore);
    }

    @undoBatch
    @action
    updateHideAfter = (activeItem: Doc) => {
        activeItem.presHideAfter = !activeItem.presHideAfter;
        Array.from(this.pres._selectedArray.keys()).forEach((doc) => doc.presHideAfter = activeItem.presHideAfter);
    }

    @undoBatch
    @action
    updateOpenDoc = (activeItem: Doc) => {
        activeItem.openDocument = !activeItem.openDocument;
        Array.from(this.pres._selectedArray.keys()).forEach((doc) => {
            doc.openDocument = activeItem.openDocument;
        });
    }

    /**
     * When the movement dropdown is changes
     */
    @undoBatch
    updateMovement = action((movement: any, all?: boolean) => {
        const array: any[] = all ? this.pres.childDocs : Array.from(this.pres._selectedArray.keys());
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
        });
    });

    @undoBatch
    @action
    updateEffect = (effect: any, all?: boolean) => {
        const array: any[] = all ? this.pres.childDocs : Array.from(this.pres._selectedArray.keys());
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

    @undoBatch
    @action
    updateEffectDirection = (effect: any, all?: boolean) => {
        const array: any[] = all ? this.pres.childDocs : Array.from(this.pres._selectedArray.keys());
        array.forEach((doc) => {
            const tagDoc = Cast(doc.presentationTargetDoc, Doc, null);
            switch (effect) {
                case PresEffect.Left:
                    tagDoc.presEffectDirection = PresEffect.Left;
                    break;
                case PresEffect.Right:
                    tagDoc.presEffectDirection = PresEffect.Right;
                    break;
                case PresEffect.Top:
                    tagDoc.presEffectDirection = PresEffect.Top;
                    break;
                case PresEffect.Bottom:
                    tagDoc.presEffectDirection = PresEffect.Bottom;
                    break;
                case PresEffect.Center: default:
                    tagDoc.presEffectDirection = PresEffect.Center;
                    break;
            }
        });
    }

    // Converts seconds to ms and updates presTransition
    setTransitionTime = (number: String, change?: number) => {
        let timeInMS = Number(number) * 1000;
        if (change) timeInMS += change;
        if (timeInMS < 100) timeInMS = 100;
        if (timeInMS > 10000) timeInMS = 10000;
        Array.from(PresBox.Instance._selectedArray.keys()).forEach((doc) => doc.presTransition = timeInMS);
    }

    // Converts seconds to ms and updates presDuration
    setDurationTime = (number: String, change?: number) => {
        let timeInMS = Number(number) * 1000;
        if (change) timeInMS += change;
        if (timeInMS < 100) timeInMS = 100;
        if (timeInMS > 20000) timeInMS = 20000;
        Array.from(PresBox.Instance._selectedArray.keys()).forEach((doc) => doc.presDuration = timeInMS);
    }

    setMovementName = action((movement: any, activeItem: Doc): string => {
        let output: string = 'none';
        switch (movement) {
            case PresMovement.Zoom: output = 'Pan & Zoom'; break; //Pan and zoom
            case PresMovement.Pan: output = 'Pan'; break; //Pan
            case PresMovement.Jump: output = 'Jump cut'; break; //Jump Cut
            case PresMovement.None: output = 'No Movement'; break; //None
            default: output = 'Zoom'; activeItem.presMovement = 'zoom'; break; //default set as zoom
        }
        return output;
    });

    @computed get transitionDropdown() {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        const isPresCollection: boolean = (targetDoc === this.pres.layoutDoc.presCollection);
        const isPinWithView: boolean = BoolCast(activeItem.presPinView);
        if (activeItem && targetDoc) {
            const transitionSpeed = activeItem.presTransition ? NumCast(activeItem.presTransition) / 1000 : 0.5;
            let duration = activeItem.presDuration ? NumCast(activeItem.presDuration) / 1000 : 2;
            if (activeItem.type === DocumentType.AUDIO) duration = NumCast(activeItem.duration);
            const effect = targetDoc.presEffect ? targetDoc.presEffect : 'None';
            activeItem.presMovement = activeItem.presMovement ? activeItem.presMovement : 'Zoom';
            return (
                <div className={`presBox-ribbon ${this.pres.layoutDoc.presStatus === "edit" ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onClick={action(e => { e.stopPropagation(); this.openMovementDropdown = false; this.openEffectDropdown = false; })}>
                    <div className="ribbon-box">
                        Movement
                        {isPresCollection || (isPresCollection && isPinWithView) ?
                            <div className="ribbon-property" style={{ marginLeft: 0, height: 25, textAlign: 'left', paddingLeft: 5, paddingRight: 5, fontSize: 10 }}>
                                {this.scrollable ? "Scroll to pinned view" : !isPinWithView ? "No movement" : "Pan & Zoom to pinned view"}
                            </div>
                            :
                            <div className="presBox-dropdown" onClick={action(e => { e.stopPropagation(); this.openMovementDropdown = !this.openMovementDropdown; })} style={{ borderBottomLeftRadius: this.openMovementDropdown ? 0 : 5, border: this.openMovementDropdown ? `solid 2px ${PresColor.DarkBlue}` : 'solid 1px black' }}>
                                {this.setMovementName(activeItem.presMovement, activeItem)}
                                <FontAwesomeIcon className='presBox-dropdownIcon' style={{ gridColumn: 2, color: this.openMovementDropdown ? PresColor.DarkBlue : 'black' }} icon={"angle-down"} />
                                <div className={'presBox-dropdownOptions'} id={'presBoxMovementDropdown'} onPointerDown={e => e.stopPropagation()} style={{ display: this.openMovementDropdown ? "grid" : "none" }}>
                                    <div className={`presBox-dropdownOption ${activeItem.presMovement === PresMovement.None ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateMovement(PresMovement.None)}>None</div>
                                    <div className={`presBox-dropdownOption ${activeItem.presMovement === PresMovement.Zoom ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateMovement(PresMovement.Zoom)}>Pan {"&"} Zoom</div>
                                    <div className={`presBox-dropdownOption ${activeItem.presMovement === PresMovement.Pan ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateMovement(PresMovement.Pan)}>Pan</div>
                                    <div className={`presBox-dropdownOption ${activeItem.presMovement === PresMovement.Jump ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateMovement(PresMovement.Jump)}>Jump cut</div>
                                </div>
                            </div>
                        }
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
                            {isPresCollection ? (null) : <Tooltip title={<><div className="dash-tooltip">{"Hide before presented"}</div></>}><div className={`ribbon-toggle ${activeItem.presHideBefore ? "active" : ""}`} onClick={() => this.updateHideBefore(activeItem)}>Hide before</div></Tooltip>}
                            {isPresCollection ? (null) : <Tooltip title={<><div className="dash-tooltip">{"Hide after presented"}</div></>}><div className={`ribbon-toggle ${activeItem.presHideAfter ? "active" : ""}`} onClick={() => this.updateHideAfter(activeItem)}>Hide after</div></Tooltip>}
                            <Tooltip title={<><div className="dash-tooltip">{"Open document in a new tab"}</div></>}><div className="ribbon-toggle" style={{ backgroundColor: activeItem.openDocument ? PresColor.LightBlue : "" }} onClick={() => this.updateOpenDoc(activeItem)}>Open</div></Tooltip>
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
                    {isPresCollection ? (null) : <div className="ribbon-box">
                        Effects
                        <div className="presBox-dropdown" onClick={action(e => { e.stopPropagation(); this.openEffectDropdown = !this.openEffectDropdown; })} style={{ borderBottomLeftRadius: this.openEffectDropdown ? 0 : 5, border: this.openEffectDropdown ? `solid 2px ${PresColor.DarkBlue}` : 'solid 1px black' }}>
                            {effect}
                            <FontAwesomeIcon className='presBox-dropdownIcon' style={{ gridColumn: 2, color: this.openEffectDropdown ? PresColor.DarkBlue : 'black' }} icon={"angle-down"} />
                            <div className={'presBox-dropdownOptions'} id={'presBoxMovementDropdown'} style={{ display: this.openEffectDropdown ? "grid" : "none" }} onPointerDown={e => e.stopPropagation()}>
                                <div className={`presBox-dropdownOption ${targetDoc.presEffect === PresEffect.None || !targetDoc.presEffect ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateEffect(PresEffect.None)}>None</div>
                                <div className={`presBox-dropdownOption ${targetDoc.presEffect === PresEffect.Fade ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateEffect(PresEffect.Fade)}>Fade In</div>
                                <div className={`presBox-dropdownOption ${targetDoc.presEffect === PresEffect.Flip ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateEffect(PresEffect.Flip)}>Flip</div>
                                <div className={`presBox-dropdownOption ${targetDoc.presEffect === PresEffect.Rotate ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateEffect(PresEffect.Rotate)}>Rotate</div>
                                <div className={`presBox-dropdownOption ${targetDoc.presEffect === PresEffect.Bounce ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateEffect(PresEffect.Bounce)}>Bounce</div>
                                <div className={`presBox-dropdownOption ${targetDoc.presEffect === PresEffect.Roll ? "active" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={() => this.updateEffect(PresEffect.Roll)}>Roll</div>
                            </div>
                        </div>
                        <div className="ribbon-doubleButton" style={{ display: effect === 'None' ? "none" : "inline-flex" }}>
                            <div className="presBox-subheading" >Effect direction</div>
                            <div className="ribbon-property">
                                {this.effectDirection}
                            </div>
                        </div>
                        <div className="effectDirection" style={{ display: effect === 'None' ? "none" : "grid", width: 40 }}>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from left"}</div></>}><div style={{ gridColumn: 1, gridRow: 2, justifySelf: 'center', color: targetDoc.presEffectDirection === PresEffect.Left ? PresColor.LightBlue : "black", cursor: "pointer" }} onClick={() => this.updateEffectDirection(PresEffect.Left)}><FontAwesomeIcon icon={"angle-right"} /></div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from right"}</div></>}><div style={{ gridColumn: 3, gridRow: 2, justifySelf: 'center', color: targetDoc.presEffectDirection === PresEffect.Right ? PresColor.LightBlue : "black", cursor: "pointer" }} onClick={() => this.updateEffectDirection(PresEffect.Right)}><FontAwesomeIcon icon={"angle-left"} /></div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from top"}</div></>}><div style={{ gridColumn: 2, gridRow: 1, justifySelf: 'center', color: targetDoc.presEffectDirection === PresEffect.Top ? PresColor.LightBlue : "black", cursor: "pointer" }} onClick={() => this.updateEffectDirection(PresEffect.Top)}><FontAwesomeIcon icon={"angle-down"} /></div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from bottom"}</div></>}><div style={{ gridColumn: 2, gridRow: 3, justifySelf: 'center', color: targetDoc.presEffectDirection === PresEffect.Bottom ? PresColor.LightBlue : "black", cursor: "pointer" }} onClick={() => this.updateEffectDirection(PresEffect.Bottom)}><FontAwesomeIcon icon={"angle-up"} /></div></Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">{"Enter from center"}</div></>}><div style={{ gridColumn: 2, gridRow: 2, width: 10, height: 10, alignSelf: 'center', justifySelf: 'center', border: targetDoc.presEffectDirection === PresEffect.Center || !targetDoc.presEffectDirection ? `solid 2px ${PresColor.LightBlue}` : "solid 2px black", borderRadius: "100%", cursor: "pointer" }} onClick={() => this.updateEffectDirection(PresEffect.Center)}></div></Tooltip>
                        </div>
                    </div>}
                    <div className="ribbon-final-box">
                        <div className="ribbon-final-button-hidden" onClick={() => this.applyTo(this.pres.childDocs)}>
                            Apply to all
                        </div>
                    </div>
                </div >
            );
        }
    }

    @undoBatch
    @action
    applyTo = (array: Doc[]) => {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        this.updateMovement(activeItem.presMovement, true);
        this.updateEffect(targetDoc.presEffect, true);
        this.updateEffectDirection(targetDoc.presEffectDirection, true);
        array.forEach((doc) => {
            const curDoc = Cast(doc, Doc, null);
            const tagDoc = Cast(curDoc.presentationTargetDoc, Doc, null);
            if (tagDoc && targetDoc) {
                curDoc.presTransition = activeItem.presTransition;
                curDoc.presDuration = activeItem.presDuration;
                curDoc.presHideBefore = activeItem.presHideBefore;
                curDoc.presHideAfter = activeItem.presHideAfter;
            }
        });
    }

    @computed get mediaOptionsDropdown() {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        if (activeItem && targetDoc) {
            return (
                <div>
                    <div className={'presBox-ribbon'} onClick={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                        <div className="ribbon-box">
                            <div className="ribbon-doubleButton" style={{ display: targetDoc.type === DocumentType.AUDIO ? "inline-flex" : "none" }}>
                                <div className="ribbon-toggle" style={{ backgroundColor: activeItem.playAuto ? PresColor.LightBlue : "" }} onClick={() => activeItem.playAuto = !activeItem.playAuto}>Play automatically</div>
                                <div className="ribbon-toggle" style={{ display: "flex", backgroundColor: activeItem.playAuto ? "" : PresColor.LightBlue }} onClick={() => activeItem.playAuto = !activeItem.playAuto}>Play on next</div>
                            </div>
                            {/* {targetDoc.type === DocumentType.VID ? <div className="ribbon-toggle" style={{ backgroundColor: activeItem.presVidFullScreen ? PresColor.LightBlue : "" }} onClick={() => activeItem.presVidFullScreen = !activeItem.presVidFullScreen}>Full screen</div> : (null)} */}
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
                        </div>
                    </div>
                </div >
            );
        }
    }

    @computed get presPinViewOptionsDropdown() {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        const presPinWithViewIcon = <img src="/assets/pinWithView.png" style={{ margin: "auto", width: 16, filter: 'invert(1)' }} />;
        return (
            <>
                {this.panable || this.scrollable || this.targetDoc.type === DocumentType.COMPARISON ? 'Pinned view' : (null)}
                <div className="ribbon-doubleButton">
                    <Tooltip title={<><div className="dash-tooltip">{activeItem.presPinView ? "Turn off pin with view" : "Turn on pin with view"}</div></>}><div className="ribbon-toggle" style={{ width: 20, padding: 0, backgroundColor: activeItem.presPinView ? PresColor.LightBlue : "" }}
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
            </>
        );
    }

    @computed get panOptionsDropdown() {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        return (
            <>
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
            </>
        );
    }

    @computed get scrollOptionsDropdown() {
        const activeItem: Doc = this.activeItem;
        const targetDoc: Doc = this.targetDoc;
        return (
            <>
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
            </>
        );
    }
}