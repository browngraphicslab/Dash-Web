export namespace Hypothesis {
    export const getAnnotation = async (username: String, searchParam: String) => {
        const base = 'https://api.hypothes.is/api/search';
        const request = base + `?user=acct:${username}@hypothes.is&text=${searchParam}`;
        console.log("DASH Querying " + request);
        const response = await fetch(request);
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('DASH: Error in GET request');
        }
    };

    export const makeAnnotationUrl = (annotationId: string, baseUrl: string) => {
        return `https://hyp.is/${annotationId}/${baseUrl}`;
    };
}