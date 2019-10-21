import React = require("react");
import { observer } from "mobx-react";
import { SketchPicker } from 'react-color';
import { FieldView, FieldViewProps } from './FieldView';
import "./ColorBox.scss";
import { InkingControl } from "../InkingControl";
import { DocStaticComponent } from "../DocComponent";
import { documentSchema } from "./DocumentView";
import { makeInterface } from "../../../new_fields/Schema";
import { trace, reaction, observable, action, IReactionDisposer } from "mobx";
import { SelectionManager } from "../../util/SelectionManager";
import { StrCast } from "../../../new_fields/Types";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";

type ColorDocument = makeInterface<[typeof documentSchema]>;
const ColorDocument = makeInterface(documentSchema);

@observer
export class ColorBox extends DocStaticComponent<FieldViewProps, ColorDocument>(ColorDocument) {
    public static LayoutString(fieldKey?: string) { return FieldView.LayoutString(ColorBox, fieldKey); }

    _selectedDisposer: IReactionDisposer | undefined;
    _penDisposer: IReactionDisposer | undefined;
    @observable _startupColor = "black";

    componentDidMount() {
        this._selectedDisposer = reaction(() => SelectionManager.SelectedDocuments(),
            action(() => this._startupColor = SelectionManager.SelectedDocuments().length ? StrCast(SelectionManager.SelectedDocuments()[0].Document.backgroundColor, "black") : "black"),
            { fireImmediately: true });
        this._penDisposer = reaction(() => CurrentUserUtils.ActivePen,
            action(() => this._startupColor = CurrentUserUtils.ActivePen ? StrCast(CurrentUserUtils.ActivePen.backgroundColor, "black") : "black"),
            { fireImmediately: true });
    }
    componentWillUnmount() {
        this._penDisposer && this._penDisposer();
        this._selectedDisposer && this._selectedDisposer();
    }

    render() {
        return <div className={`colorBox-container${this.active() ? "-interactive" : ""}`}
            onPointerDown={e => e.button === 0 && !e.ctrlKey && e.stopPropagation()}>
            <SketchPicker color={this._startupColor} onChange={InkingControl.Instance.switchColor} />
        </div>;
    }
} 