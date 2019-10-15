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

type ColorDocument = makeInterface<[typeof documentSchema]>;
const ColorDocument = makeInterface(documentSchema);

@observer
export class ColorBox extends DocStaticComponent<FieldViewProps, ColorDocument>(ColorDocument) {
    public static LayoutString(fieldKey?: string) { return FieldView.LayoutString(ColorBox, fieldKey); }
    _selectedDisposer: IReactionDisposer | undefined;
    componentDidMount() {
        this._selectedDisposer = reaction(() => SelectionManager.SelectedDocuments(),
            action(() => this._startupColor = SelectionManager.SelectedDocuments().length ? StrCast(SelectionManager.SelectedDocuments()[0].Document.backgroundColor, "black") : "black"),
            { fireImmediately: true });

        // compare to this reaction that used to be in Selection Manager
        // reaction(() => manager.SelectedDocuments, sel => {
        //     let targetColor = "#FFFFFF";
        //     if (sel.length > 0) {
        //         let firstView = sel[0];
        //         let doc = firstView.props.Document;
        //         let targetDoc = doc.isTemplate ? doc : Doc.GetProto(doc);
        //         let stored = StrCast(targetDoc.backgroundColor);
        //         stored.length > 0 && (targetColor = stored);
        //     }
        //     InkingControl.Instance.updateSelectedColor(targetColor);
        // }, { fireImmediately: true });
    }
    componentWillUnmount() {
        this._selectedDisposer && this._selectedDisposer();
    }

    @observable _startupColor = "black";

    render() {
        return <div className={`colorBox-container${this.active() ? "-interactive" : ""}`}
            onPointerDown={e => e.button === 0 && !e.ctrlKey && e.stopPropagation()}>
            <SketchPicker color={this._startupColor} onChange={InkingControl.Instance.switchColor} />
        </div>;
    }
} 