import React = require("react");
import { observer } from "mobx-react";
import { SketchPicker } from 'react-color';
import { FieldView, FieldViewProps } from './FieldView';
import "./ColorBox.scss";
import { InkingControl } from "../InkingControl";
import { DocExtendableComponent } from "../DocComponent";
import { makeInterface } from "../../../new_fields/Schema";
import { reaction, observable, action, IReactionDisposer } from "mobx";
import { SelectionManager } from "../../util/SelectionManager";
import { StrCast } from "../../../new_fields/Types";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { documentSchema } from "../../../new_fields/documentSchemas";

type ColorDocument = makeInterface<[typeof documentSchema]>;
const ColorDocument = makeInterface(documentSchema);

@observer
export class ColorBox extends DocExtendableComponent<FieldViewProps, ColorDocument>(ColorDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(ColorBox, fieldKey); }

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
            onPointerDown={e => e.button === 0 && !e.ctrlKey && e.stopPropagation()}
            style={{ transformOrigin: "top left", transform: `scale(${this.props.ContentScaling()})`, width: `${100 / this.props.ContentScaling()}%`, height: `${100 / this.props.ContentScaling()}%` }} >

            <SketchPicker color={this._startupColor} onChange={InkingControl.Instance.switchColor} />
        </div>;
    }
} 