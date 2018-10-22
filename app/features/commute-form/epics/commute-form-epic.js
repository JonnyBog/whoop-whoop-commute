import { Observable } from 'rxjs/Rx';
import 'rxjs/add/operator/switchMap';
import 'rxjs/add/operator/catch';
import 'rxjs/add/operator/map';
import { catchError } from 'rxjs/operators';

import {
  COMMUTE_FORM_REQUEST,
  receiveCommuteFormData,
  failedCommuteFormRequest
} from 'features/commute-form/actions/commute-form-actions';

const constants = {
  tflAppId: 'b4aa26bb',
  tflAppKey: '938e3b49ed68cab0d4b0191d4aa914aa',
  genericFail: 'Oops, something has gone wrong. There might be an issue with a station in this area.'
};

/**
 * fetchCommuteFormData
 * @param {Object} action$ - action observable
 * @param {Object} store - redux store
 * @param {Object} dependencies - injected dependencies
 * @return {Object} - action observable
 */
export default function fetchCommuteFormData (action$, store, { apiHelper }) {
  return action$.ofType(COMMUTE_FORM_REQUEST)
    .switchMap(action =>
      Observable.fromPromise(apiHelper.get(
        `https://api.tfl.gov.uk/StopPoint?stopTypes=NaptanMetroStation,NaptanRailStation&radius=${action.halfMileRadius}&lat=${action.lat}&lon=${action.lng}&app_id=${constants.tflAppId}&app_key=${constants.tflAppKey}`
      ))
        .switchMap(response => {
          if (!response.data.stopPoints.length) {
            return Observable.of(failedCommuteFormRequest('There are no stations in this area.'));
          }

          return Observable.forkJoin(
            response.data.stopPoints
              .filter(stopPoint => stopPoint.icsCode && stopPoint.icsCode !== action.workStation)
              .filter(stopPoint => !stopPoint.commonName.includes('International'))
              .map(stopPoint =>
                Observable.fromPromise(
                  apiHelper.get(
                    `https://api.tfl.gov.uk/Journey/JourneyResults/${stopPoint.icsCode}/to/${action.workStation}&time=0900&app_id=${constants.tflAppId}&app_key=${constants.tflAppKey}`
                  )
                )
              )
          )
            .map(responses => {
              const responseData = [];

              responses
                .forEach(journeyResponse => {
                  responseData.push(journeyResponse.data.journeys[0]);
                });

              return receiveCommuteFormData(responseData);
            })
            .pipe(
              catchError(error => {
                const errorMessage =
                  error.response && error.response.data.toLocationDisambiguation.matchStatus === 'empty'
                    ? 'Please enter a valid station for your work station'
                    : constants.genericFail;

                return Observable.of(failedCommuteFormRequest(errorMessage));
              })
            );
        })
        .catch(error => {
          const errorMessage =
            error.message === 'Network Error'
              ? 'There must be too many stations in this area!'
              : constants.genericFail;

          return Observable.of(failedCommuteFormRequest(errorMessage));
        }));
}
