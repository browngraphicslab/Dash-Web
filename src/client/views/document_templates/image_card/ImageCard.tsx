import * as React from 'react';
import { DocComponent } from '../../DocComponent';
import { FieldViewProps } from '../../nodes/FieldView';
import { createSchema, makeInterface } from '../../../../new_fields/Schema';
import { createInterface } from 'readline';
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