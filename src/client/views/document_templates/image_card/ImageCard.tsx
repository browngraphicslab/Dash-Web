dimport * as React from 'react';
import { FieldViewProps } from '../../nodes/FieldView';
import { ImageBox } from '../../nodes/ImageBox';

export default class ImageCard extends React.Component<FieldViewProps> {

    render() {
        return (
            <div style={{ padding: 30, borderRadius: 15 }}>
                <ImageBox {...this.props} />
            </div>
        );
    }

}