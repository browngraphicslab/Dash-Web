import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from '@material-ui/core';
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, Opt } from "../../fields/Doc";
import { InkField } from '../../fields/InkField';
import { RichTextField } from '../../fields/RichTextField';
import { BoolCast, StrCast } from "../../fields/Types";
import { DocUtils } from '../documents/Documents';
import { DocumentType } from '../documents/DocumentTypes';
import { SelectionManager } from '../util/SelectionManager';
import { undoBatch } from '../util/UndoManager';
import { CollectionViewType } from './collections/CollectionView';
import { InkingStroke } from './InkingStroke';
import { DocumentView } from './nodes/DocumentView';
import './PropertiesButtons.scss';
import React = require("react");
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

enum UtilityButtonState {
    Default,
    OpenRight,
    OpenExternally
}
@observer
export class PropertiesButtons extends React.Component<{}, {}> {
    @observable public static Instance: PropertiesButtons;

    @computed get selectedDoc() { return SelectionManager.SelectedSchemaDoc() || SelectionManager.Views().lastElement()?.rootDoc; }

    propertyToggleBtn = (label: string, property: string, tooltip: (on?: any) => string, icon: (on: boolean) => string, onClick?: (dv: Opt<DocumentView>, doc: Doc, property: string) => void) => {
        const targetDoc = this.selectedDoc;
        const onPropToggle = (dv: Opt<DocumentView>, doc: Doc, prop: string) => (dv?.layoutDoc || doc)[prop] = (dv?.layoutDoc || doc)[prop] ? undefined : true;
        return !targetDoc ? (null) :
            <Tooltip title={<div className={`dash-tooltip`}>{tooltip(targetDoc?.[property])} </div>} placement="top">
                <div>
                    <div className={`propertiesButtons-linkButton-empty toggle-${StrCast(targetDoc[property]).includes(":hover") ? "hover" : targetDoc[property] ? "on" : "off"}`}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={undoBatch(() => {
                            if (SelectionManager.Views().length) {
                                SelectionManager.Views().forEach(dv => (onClick ?? onPropToggle)(dv, dv.rootDoc, property));
                            } else if (targetDoc) (onClick ?? onPropToggle)(undefined, targetDoc, property);
                        })} >
                        <FontAwesomeIcon className="documentdecorations-icon" size="lg" icon={icon(BoolCast(targetDoc?.[property])) as any} />
                    </div>
                    <div className="propertiesButtons-title">{label}</div>
                </div>
            </Tooltip>;
    }
    @computed get lockButton() {
        return this.propertyToggleBtn("No\xA0Drag", "_lockedPosition", on => `${on ? "Unlock" : "Lock"} position to prevent dragging`, on => "thumbtack");
    }
    @computed get dictationButton() {
        return this.propertyToggleBtn("Dictate", "_showAudio", on => `${on ? "Hide" : "Show"} dictation/recording controls`, on => "microphone");
    }
    @computed get maskButton() {
        return this.propertyToggleBtn("Mask", "isInkMask", on => on ? "Make plain ink" : "Make highlight mask", on => "paint-brush", (dv, doc) => InkingStroke.toggleMask(dv?.layoutDoc || doc));
    }
    @computed get clustersButton() {
        return this.propertyToggleBtn("Clusters", "_useClusters", on => `${on ? "Hide" : "Show"} clusters`, on => "braille");
    }
    @computed get panButton() {
        return this.propertyToggleBtn("Lock\xA0View", "_lockedTransform", on => `${on ? "Unlock" : "Lock"} panning of view`, on => "lock");
    }
    @computed get fitContentButton() {
        return this.propertyToggleBtn("View All", "_fitToBox", on => `${on ? "Don't" : ""} fit content to container visible area`, on => "eye");
    }
    @computed get fitWidthButton() {
        return this.propertyToggleBtn("Fit\xA0Width", "_fitWidth", on => `${on ? "Don't" : ""} fit content to width of container`, on => "arrows-alt-h");
    }
    @computed get captionButton() {
        return this.propertyToggleBtn("Caption", "_showCaption", on => `${on ? "Hide" : "Show"} caption footer`, on => "closed-captioning", (dv, doc) => (dv?.rootDoc || doc)._showCaption = (dv?.rootDoc || doc)._showCaption === undefined ? "caption" : undefined);
    }
    @computed get chromeButton() {
        return this.propertyToggleBtn("Controls", "_chromeStatus", on => `${on === "enabled" ? "Hide" : "Show"} editing UI`, on => "edit", (dv, doc) => (dv?.rootDoc || doc)._chromeStatus = (dv?.rootDoc || doc)._chromeStatus === undefined ? "enabled" : undefined);
    }
    @computed get titleButton() {
        return this.propertyToggleBtn("Title", "_showTitle", on => "Switch between title styles", on => "text-width", (dv, doc) => (dv?.rootDoc || doc)._showTitle = !(dv?.rootDoc || doc)._showTitle ? "title" : (dv?.rootDoc || doc)._showTitle === "title" ? "title:hover" : undefined);
    }
    @computed get autoHeightButton() {
        return this.propertyToggleBtn("Auto\xA0Size", "_autoHeight", on => `Automatical vertical sizing to show all content`, on => "arrows-alt-v");
    }
    @computed get gridButton() {
        return this.propertyToggleBtn("Grid", "_backgroundGrid-show", on => `Display background grid in collection`, on => "border-all");
    }

    @computed
    get onClickButton() {
        return !this.selectedDoc ? (null) : <Tooltip title={<div className="dash-tooltip">Choose onClick behavior</div>} placement="top">
            <div>
                <div className="propertiesButtons-linkFlyout">
                    <Flyout anchorPoint={anchorPoints.LEFT_TOP} content={this.onClickFlyout}>
                        <div className={"propertiesButtons-linkButton-empty"} onPointerDown={e => e.stopPropagation()} >
                            <FontAwesomeIcon className="documentdecorations-icon" icon="mouse-pointer" size="lg" />
                        </div>
                    </Flyout>
                </div>
                <div className="propertiesButtons-title"> onclick </div>
            </div>
        </Tooltip>;
    }
    @computed
    get perspectiveButton() {
        return !this.selectedDoc ? (null) : <Tooltip title={<div className="dash-tooltip">Choose view perspective</div>} placement="top">
            <div>
                <div className="propertiesButtons-linkFlyout">
                    <Flyout anchorPoint={anchorPoints.LEFT_TOP} content={this.onPerspectiveFlyout}>
                        <div className={"propertiesButtons-linkButton-empty"} onPointerDown={e => e.stopPropagation()} >
                            <FontAwesomeIcon className="documentdecorations-icon" icon="mouse-pointer" size="lg" />
                        </div>
                    </Flyout>
                </div>
                <div className="propertiesButtons-title"> Perspective </div>
            </div>
        </Tooltip>;
    }

    @undoBatch
    handlePerspectiveChange = (e: any) => {
        this.selectedDoc && (this.selectedDoc._viewType = e.target.value);
        SelectionManager.Views().filter(dv => dv.docView).map(dv => dv.docView!).forEach(docView => docView.layoutDoc._viewType = e.target.value);
    }

    @undoBatch
    @action
    handleOptionChange = (e: any) => {
        this.selectedDoc && (this.selectedDoc.onClickBehavior = e.target.value);
        SelectionManager.Views().filter(dv => dv.docView).map(dv => dv.docView!).forEach(docView => {
            docView.noOnClick();
            switch (e.target.value) {
                case "enterPortal": docView.makeIntoPortal(); break;
                case "toggleDetail": docView.toggleDetail(); break;
                case "linkInPlace": docView.toggleFollowLink("inPlace", true, false); break;
                case "linkOnRight": docView.toggleFollowLink("add:right", false, false); break;
            }
        });
    }

    @undoBatch
    editOnClickScript = () => {
        if (SelectionManager.Views().length) SelectionManager.Views().forEach(dv => DocUtils.makeCustomViewClicked(dv.rootDoc, undefined, "onClick"));
        else this.selectedDoc && DocUtils.makeCustomViewClicked(this.selectedDoc, undefined, "onClick");
    }

    @computed
    get onClickFlyout() {
        const makeLabel = (value: string, label: string) => <div className="radio">
            <label>
                <input type="radio" value={value} checked={(this.selectedDoc?.onClickBehavior ?? "nothing") === value} onChange={this.handleOptionChange} />
                {label}
            </label>
        </div>;
        return <div>
            <form>
                {makeLabel("nothing", "Select Document")}
                {makeLabel("enterPortal", "Enter Portal")}
                {makeLabel("toggleDetail", "Toggle Detail")}
                {makeLabel("linkInPlace", "Follow Link")}
                {makeLabel("linkOnRight", "Open Link on Right")}
            </form>
            {Doc.UserDoc().noviceMode ? (null) : <div onPointerDown={this.editOnClickScript} className="onClickFlyout-editScript"> Edit onClick Script</div>}
        </div>;
    }
    @computed
    get onPerspectiveFlyout() {
        const excludedViewTypes = Doc.UserDoc().noviceMode ? [CollectionViewType.Invalid, CollectionViewType.Docking, CollectionViewType.Pile, CollectionViewType.StackedTimeline, CollectionViewType.Stacking, CollectionViewType.Map, CollectionViewType.Linear] :
            [CollectionViewType.Invalid, CollectionViewType.Docking, CollectionViewType.Pile, CollectionViewType.StackedTimeline, CollectionViewType.Linear];

        const makeLabel = (value: string, label: string) => <div className="radio">
            <label>
                <input type="radio" value={value} checked={(this.selectedDoc?._viewType ?? "invalid") === value} onChange={this.handlePerspectiveChange} />
                {label}
            </label>
        </div>;
        return <form>
            {Object.values(CollectionViewType).filter(type => !excludedViewTypes.includes(type)).map(type => makeLabel(type, type))}
        </form>;
    }

    render() {
        const layoutField = this.selectedDoc?.[Doc.LayoutFieldKey(this.selectedDoc)];
        const isText = layoutField instanceof RichTextField;
        const isInk = layoutField instanceof InkField;
        const isCollection = this.selectedDoc?.type === DocumentType.COL;
        const isStacking = this.selectedDoc?._viewType === CollectionViewType.Stacking;
        const isFreeForm = this.selectedDoc?._viewType === CollectionViewType.Freeform;
        const toggle = (ele: JSX.Element | null, style?: React.CSSProperties) => <div className="propertiesButtons-button" style={style}> {ele} </div>;

        return !this.selectedDoc ? (null) :
            <div className="propertiesButtons">
                {toggle(this.titleButton)}
                {toggle(this.captionButton)}
                {toggle(this.lockButton)}
                {toggle(this.dictationButton)}
                {toggle(this.onClickButton)}
                {toggle(this.fitWidthButton)}
                {toggle(this.fitContentButton, { display: !isFreeForm ? "none" : "" })}
                {toggle(this.autoHeightButton, { display: !isText && !isStacking ? "none" : "" })}
                {toggle(this.maskButton, { display: !isInk ? "none" : "" })}
                {toggle(this.chromeButton, { display: isCollection ? "" : "none" })}
                {toggle(this.gridButton, { display: isCollection ? "" : "none" })}
                {toggle(this.clustersButton, { display: !isFreeForm ? "none" : "" })}
                {toggle(this.panButton, { display: !isFreeForm ? "none" : "" })}
                {toggle(this.perspectiveButton, { display: !isCollection ? "none" : "" })}
            </div>;
    }
}