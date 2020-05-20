import * as React from "react";
import { observer } from "mobx-react";
import { computed } from "mobx";
import { Doc } from "../../../../fields/Doc";
import { NumCast, StrCast, BoolCast } from "../../../../fields/Types";
import { EditableView } from "../../EditableView";
import { DimUnit } from "./CollectionMultirowView";

interface HeightLabelProps {
    layout: Doc;
    collectionDoc: Doc;
    decimals?: number;
}

@observer
export default class HeightLabel extends React.Component<HeightLabelProps> {

    @computed
    private get contents() {
        const { layout, decimals } = this.props;
        const getUnit = () => StrCast(layout.dimUnit);
        const getMagnitude = () => String(+NumCast(layout.dimMagnitude).toFixed(decimals ?? 3));
        return (
            <div className={"label-wrapper"}>
                <EditableView
                    GetValue={getMagnitude}
                    SetValue={value => {
                        const converted = Number(value);
                        if (!isNaN(converted) && converted > 0) {
                            layout.dimMagnitude = converted;
                            return true;
                        }
                        return false;
                    }}
                    contents={getMagnitude()}
                />
                <EditableView
                    GetValue={getUnit}
                    SetValue={value => {
                        if (Object.values(DimUnit).includes(value)) {
                            layout.dimUnit = value;
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
        return BoolCast(this.props.collectionDoc.showHeightLabels) ? this.contents : (null);
    }

}