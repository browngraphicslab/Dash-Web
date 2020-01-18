import * as React from "react";
import { observer } from "mobx-react";
import { computed } from "mobx";
import { Doc } from "../../../../new_fields/Doc";
import { NumCast, StrCast, BoolCast } from "../../../../new_fields/Types";
import { EditableView } from "../../EditableView";
import { WidthUnit } from "./CollectionMulticolumnView";

interface WidthLabelProps {
    layout: Doc;
    collectionDoc: Doc;
    decimals?: number;
}

@observer
export default class WidthLabel extends React.Component<WidthLabelProps> {

    @computed
    private get contents() {
        const { layout, decimals } = this.props;
        const getUnit = () => StrCast(layout.widthUnit);
        const getMagnitude = () => String(+NumCast(layout.widthMagnitude).toFixed(decimals ?? 3));
        return (
            <div className={"label-wrapper"}>
                <EditableView
                    GetValue={getMagnitude}
                    SetValue={value => {
                        const converted = Number(value);
                        if (!isNaN(converted) && converted > 0) {
                            layout.widthMagnitude = converted;
                            return true;
                        }
                        return false;
                    }}
                    contents={getMagnitude()}
                />
                <EditableView
                    GetValue={getUnit}
                    SetValue={value => {
                        if (Object.values(WidthUnit).includes(value)) {
                            layout.widthUnit = value;
                            return true;
                        }
                        return false;
                    }}
                    contents={getUnit()}
                />
            </div>
        );
    }

    render() {
        return BoolCast(this.props.collectionDoc.showWidthLabels) ? this.contents : (null);
    }

}