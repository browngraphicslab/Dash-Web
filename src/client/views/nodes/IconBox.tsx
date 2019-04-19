import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCaretUp, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Document } from '../../../fields/Document';
import { IconField } from "../../../fields/IconFIeld";
import { KeyStore } from "../../../fields/KeyStore";
import { SelectionManager } from "../../util/SelectionManager";
import { FieldView, FieldViewProps } from './FieldView';
import "./IconBox.scss";


library.add(faCaretUp);
library.add(faObjectGroup);
library.add(faStickyNote);
library.add(faFilePdf);
library.add(faFilm);

@observer
export class IconBox extends React.Component<FieldViewProps> {
    public static LayoutString() { return FieldView.LayoutString(IconBox); }

    @computed get maximized() { return this.props.Document.GetT(KeyStore.MaximizedDoc, Document); }
    @computed get layout(): string { return this.props.Document.GetData(this.props.fieldKey, IconField, "<p>Error loading layout data</p>" as string); }
    @computed get minimizedIcon() { return IconBox.DocumentIcon(this.layout); }

    public static DocumentIcon(layout: string) {
        let button = layout.indexOf("PDFBox") !== -1 ? faFilePdf :
            layout.indexOf("ImageBox") !== -1 ? faImage :
                layout.indexOf("Formatted") !== -1 ? faStickyNote :
                    layout.indexOf("Video") !== -1 ? faFilm :
                        layout.indexOf("Collection") !== -1 ? faObjectGroup :
                            faCaretUp;
        return <FontAwesomeIcon icon={button} className="documentView-minimizedIcon" />
    }

    animateTransition(icon: number[], targ: number[], width: number, height: number, stime: number, target: Document, maximizing: boolean) {
        setTimeout(() => {
            let now = Date.now();
            let progress = Math.min(1, (now - stime) / 200);
            let pval = maximizing ?
                [icon[0] + (targ[0] - icon[0]) * progress, icon[1] + (targ[1] - icon[1]) * progress] :
                [targ[0] + (icon[0] - targ[0]) * progress, targ[1] + (icon[1] - targ[1]) * progress];
            target.SetNumber(KeyStore.Width, maximizing ? 25 + (width - 25) * progress : width + (25 - width) * progress);
            target.SetNumber(KeyStore.Height, maximizing ? 25 + (height - 25) * progress : height + (25 - height) * progress);
            target.SetNumber(KeyStore.X, pval[0]);
            target.SetNumber(KeyStore.Y, pval[1]);
            if (now < stime + 200) {
                this.animateTransition(icon, targ, width, height, stime, target, maximizing);
            }
            else {
                if (!maximizing) {
                    target.SetBoolean(KeyStore.IsMinimized, true);
                    target.SetNumber(KeyStore.X, targ[0]);
                    target.SetNumber(KeyStore.Y, targ[1]);
                    target.SetNumber(KeyStore.Width, width);
                    target.SetNumber(KeyStore.Height, height);
                }
                this._completed = true;
            }
        },
            2);
    }

    _completed = true;

    @action
    public toggleMinimize = (): void => {
        SelectionManager.DeselectAll();
        if (this.maximized instanceof Document && this._completed) {
            this._completed = false;
            let minimized = this.maximized.GetBoolean(KeyStore.IsMinimized, false);
            this.maximized.SetBoolean(KeyStore.IsMinimized, false);
            this.animateTransition(
                [this.props.Document.GetNumber(KeyStore.X, 0), this.props.Document.GetNumber(KeyStore.Y, 0)],
                [this.maximized.GetNumber(KeyStore.X, 0), this.maximized.GetNumber(KeyStore.Y, 0)],
                this.maximized.GetNumber(KeyStore.Width, 0), this.maximized.GetNumber(KeyStore.Width, 0),
                Date.now(), this.maximized, minimized);
        }
    }

    render() {
        return (
            <div className="iconBox-container" onClick={this.toggleMinimize} >
                {this.minimizedIcon}
            </div>);
    }
}