import * as React from 'react';
import { FontStyleProperty, ColorProperty } from 'csstype';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import { FormattedTextBox } from '../../nodes/FormattedTextBox';
import { FieldViewProps } from '../../nodes/FieldView';

interface DetailedCaptionDataProps {
    captionFieldKey?: string;
    detailsFieldKey?: string;
}

interface DetailedCaptionStylingProps {
    sharedFontColor?: ColorProperty;
    captionFontStyle?: FontStyleProperty;
    detailsFontStyle?: FontStyleProperty;
    toggleSize?: number;
}

@observer
export default class DetailedCaptionToggle extends React.Component<DetailedCaptionDataProps & DetailedCaptionStylingProps & FieldViewProps> {
    @observable loaded: boolean = false;
    @observable detailsExpanded: boolean = false;

    @action toggleDetails = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        this.detailsExpanded = !this.detailsExpanded;
    }

    componentDidMount() {
        runInAction(() => this.loaded = true);
    }

    render() {
        const size = this.props.toggleSize || 20;
        return (
            <div style={{
                transition: "0.5s opacity ease",
                opacity: this.loaded ? 1 : 0,
                bottom: 0,
                fontSize: 14,
                width: "100%",
                position: "absolute"
            }}>
                {/* caption */}
                <div style={{ opacity: this.detailsExpanded ? 0 : 1, transition: "opacity 0.3s ease" }}>
                    <FormattedTextBox {...this.props} fieldKey={this.props.captionFieldKey || "caption"} />
                </div>
                {/* details */}
                <div style={{ opacity: this.detailsExpanded ? 1 : 0, transition: "opacity 0.3s ease" }}>
                    <FormattedTextBox {...this.props} fieldKey={this.props.detailsFieldKey || "captiondetails"} />
                </div>
                {/* toggle */}
                <div
                    style={{
                        width: size,
                        height: size,
                        borderRadius: "50%",
                        backgroundColor: "red",
                        zIndex: 3,
                        cursor: "pointer"
                    }}
                    onClick={this.toggleDetails}
                >
                    <span style={{ color: "white" }}></span>
                </div>
            </div>
        );
    }

}
